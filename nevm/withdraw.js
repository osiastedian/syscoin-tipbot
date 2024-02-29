const { ethers, BigNumber, utils: etherUtils } = require("ethers");
const constants = require("../constants");
const db = require("../db");
const utils = require("../utils");
const config = require("../config.json");
const { getErc20Contract } = require("./utils/contract");
const { runTransaction } = require("./utils/transaction");
const prefix = config.prefix;

const sendUsageExample = (message) => {
  message.channel.send({
    embed: {
      color: constants.FAIL_COL,
      description: `Usage: ${prefix}withdraw [address] [amount] [symbol/guid]`,
    },
  });
};

const sendInvalidAddress = (message) => {
  message.channel.send({
    embed: {
      color: constants.FAIL_COL,
      description: `Withdraw: Invalid Address argument. Ex. 0x.........cad13`,
    },
  });
};

const sendInvalidAmount = (message) => {
  message.channel.send({
    embed: {
      color: constants.FAIL_COL,
      description: `Withdraw: Invalid Amount argument. Ex. 100, 0.01, or all`,
    },
  });
};

/**
 * @typedef {Object} WithdrawTokenProps
 * @property {Discord.Message} message Discord message
 * @property {string} tokenSymbol Symbol of the user
 * @property {string} userId User id of the message sender
 * @property {ethers.providers.JsonRpcProvider} jsonRpc Ethers JSON PRC Provider
 * @property {string} amount amount of withdrawal
 * @property {ethers.Wallet} wallet nevm
 * @property {string} recepientAddress NEVM address of Recepient
 */

/**
 *
 * @param {WithdrawTokenProps} params
 * @returns
 */
const generateWithdrawTransactionConfig = async (params, networkConfig) => {
  const {
    tokenSymbol,
    message,
    jsonRpc,
    userId,
    amount,
    wallet,
    recepientAddress,
  } = params;
  const isWithdrawAll = amount === "all";
  const token = networkConfig.supportedTokens.find(
    (token) => token.symbol === tokenSymbol.toUpperCase()
  );
  if (!token) {
    return message.channel.send({
      embed: {
        color: constants.FAIL_COL,
        description: `Hi, **<@${userId}>** \n*${tokenSymbol.toUpperCase()}* is not supported.`,
      },
    });
  }
  const tokenContract = getErc20Contract(token.address, jsonRpc);
  const balance = await tokenContract.balanceOf(wallet.address);
  if (!isWithdrawAll && etherUtils.parseEther(amount).gt(balance)) {
    message.channel.send({
      embed: {
        color: constants.FAIL_COL,
        description:
          "Sorry, you cannot withdraw more than is available in your balance.",
      },
    });
    return;
  }

  let value = isWithdrawAll ? balance : etherUtils.parseEther(amount);

  const nonce = await jsonRpc.getTransactionCount(wallet.address);

  const transferTransactionConfig =
    await tokenContract.populateTransaction.transfer(recepientAddress, value);

  const { maxPriorityFeePerGas, maxFeePerGas } = await jsonRpc.getFeeData();

  const transactionConfig = {
    type: 2,
    chainId: networkConfig.chainId,
    value: 0,
    gasLimit: networkConfig.tokenGasLimit,
    nonce,
    maxFeePerGas: maxFeePerGas ?? etherUtils.parseUnits("40", "gwei"),
    maxPriorityFeePerGas:
      maxPriorityFeePerGas?.mul(2) ?? etherUtils.parseUnits("3", "gwei"),
    ...transferTransactionConfig,
  };

  return transactionConfig;
};

/**
 * Withdraw SYS from author's nevm wallet.
 * @param {Discord.Client} client Discord Client
 * @param {Discord.Message} message Discord message
 * @param {string[]} args Command arguments
 */
async function withdraw(client, message, args) {
  if (args.length < 2) {
    return sendUsageExample(message);
  }
  const [
    address,
    amount,
    networkName = process.env.DEFAULT_EVM_NETWORK,
    tokenSymbol = "SYS",
  ] = args;
  const isWithdrawAll = amount === "all";

  if (!etherUtils.isAddress(address)) {
    return sendInvalidAddress(message);
  }

  if (!isWithdrawAll && !BigNumber.isBigNumber(etherUtils.parseEther(amount))) {
    console.log("Invalid Amount", amount);
    return sendInvalidAmount(message);
  }

  const userId = message.author.id;

  const user = await client.users.fetch(userId);

  if (!user) {
    return message.channel.send({
      embed: {
        color: constants.FAIL_COL,
        description: "Could not find user. Please contact an admin.",
      },
    });
  }
  const profile = await db.getProfile(userId);
  if (!profile) {
    return message.channel
      .send({
        embed: {
          color: constants.FAIL_COL,
          description:
            "You don't have a profile yet. Use `!register` to create one.",
        },
      })
      .then((msg) => {
        utils.deleteMsgAfterDelay(msg, 15000);
      });
  }

  const nevmWallet = await db.nevm.getNevmWallet(userId);
  const wallet = new ethers.Wallet(nevmWallet.privateKey);

  if (!nevmWallet) {
    return message.channel
      .send({
        embed: {
          color: constants.FAIL_COL,
          description:
            "You don't have a nevm wallet yet. Use `!register nevm` to create one.",
        },
      })
      .then((msg) => {
        utils.deleteMsgAfterDelay(msg, 15000);
      });
  }

  const networkConfig = config[networkName.toLowerCase()];
  const jsonRpc = new ethers.providers.JsonRpcProvider(networkConfig.rpcUrl);

  let transactionConfig = null;
  if (tokenSymbol && tokenSymbol.toUpperCase() !== "SYS") {
    transactionConfig = await generateWithdrawTransactionConfig(
      {
        tokenSymbol,
        message,
        jsonRpc,
        userId,
        amount,
        wallet,
        recepientAddress: address,
      },
      networkConfig
    );
  } else {
    const balance = await jsonRpc.getBalance(nevmWallet.address);

    let value = isWithdrawAll ? balance : etherUtils.parseEther(amount);

    if (!isWithdrawAll && value.gt(balance)) {
      message.channel.send({
        embed: {
          color: constants.FAIL_COL,
          description:
            "Sorry, you cannot withdraw more than is available in your balance.",
        },
      });
      return;
    }

    const { maxFeePerGas, maxPriorityFeePerGas } = await jsonRpc.getFeeData();
    const defaultMaxFeePerGas = etherUtils.parseUnits("10", "gwei");
    const initialTransactionConfig = {
      type: 2,
      chainId: networkConfig.chainId,
      to: address,
      from: nevmWallet.address,
      value: value,
    };

    const estimatedGasLimit = await jsonRpc.estimateGas(
      initialTransactionConfig
    );
    const gasLimit = estimatedGasLimit ?? networkConfig.gasLimit;

    if (!value.gt(0)) {
      message.channel.send({
        embed: {
          color: constants.FAIL_COL,
          description:
            "The value you are trying to withdraw must be a valid number more than 0.",
        },
      });
      return;
    }

    const maxGasFee = (maxFeePerGas ?? defaultMaxFeePerGas).mul(gasLimit);
    const minTip = etherUtils.parseUnits(`0.01`, "ether");

    if (isWithdrawAll) {
      value = value.sub(minTip);
    }

    const nonce = await jsonRpc.getTransactionCount(wallet.address);

    const minimumAmount = minTip.add(maxGasFee);

    if (!isWithdrawAll && value.lt(minTip.add(maxGasFee))) {
      return message.channel.send({
        embed: {
          color: constants.FAIL_COL,
          description: `The value you are trying to withdraw is too small, it must be more than ${etherUtils.formatEther(
            minimumAmount.toString()
          )}.`,
        },
      });
    }

    transactionConfig = {
      ...initialTransactionConfig,
      value,
      gasLimit,
      nonce,
      maxFeePerGas,
      maxPriorityFeePerGas,
    };
  }

  console.log("Sending Transaction...", wallet.address, transactionConfig);
  runTransaction(wallet.privateKey, transactionConfig, jsonRpc)
    .then((response) => {
      console.log("Transaction Sent!");
      const explorerLink = utils.getNevmExplorerLink(
        response.hash,
        "transaction",
        "Click Here to View Transaction",
        networkName
      );
      user.send({
        embed: {
          color: constants.SUCCESS_COL,
          description: `Your withdrawal transaction was sent! Please wait for it to be mined.\n${explorerLink}`,
        },
      });
      return response.wait(1);
    })
    .then((receipt) => {
      console.log("Transaction Confirmed!");
      const explorerLink = utils.getNevmExplorerLink(
        receipt.transactionHash,
        "transaction",
        "Click Here to View Transaction",
        networkName
      );
      user.send({
        embed: {
          color: constants.SUCCESS_COL,
          description: `Your withdrawal was successful!\n ${explorerLink}`,
        },
      });
    });
}

module.exports = withdraw;
