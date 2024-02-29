const ethers = require("ethers");
const db = require("../db");
const constants = require("../c.json");
const utils = require("../utils");
const Discord = require("discord.js");
const config = require("../config.json");
const { getErc20Contract } = require("./utils/contract");

/**
 * Fetch ERC20 token balance
 * @param {ethers.providers.JsonRpcProvider} provider Ethers JSON PRC Provider
 * @param {string} tokenSymbol Symbol of token being queried
 * @param {string} walletAddress Wallet address of owner
 * @returns {Promise<number> | undefined} Balance of wallet in wei or undefined if not supported
 */
const getTokenBalance = (provider, tokenAddress, walletAddress) => {
  const tokenContract = getErc20Contract(tokenAddress, provider);

  return tokenContract.balanceOf(walletAddress);
};

/**
 * Show SYS balance in NEVM of author
 * @param {Discord.Client} client Discord Client
 * @param {Discord.Message} message Discord message
 * @param {string[]} args Message Arguments
 */
async function balance(client, message, args) {
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

  const networkName = (args[0] ?? process.env.DEFAULT_EVM_NETWORK).toLowerCase();
  const networkConfig = config[networkName.toLowerCase()];

  const jsonProvider = new ethers.providers.JsonRpcProvider(
    networkConfig.rpcUrl
  );

  let balanceInWei = await jsonProvider.getBalance(nevmWallet.address);
  const tokenBalances = await Promise.all(
    networkConfig.supportedTokens.map(async (token) => {
      const balance = await getTokenBalance(
        jsonProvider,
        token.address,
        nevmWallet.address
      );
      return { token, balance };
    })
  );
  const tokenBalancesStr = tokenBalances.map(
    ({ token, balance }) =>
      `${utils.getNevmExplorerLink(
        token.address,
        "token",
        token.symbol,
        networkName
      )}: ${ethers.utils.formatEther(balance)}`
  );

  const balanceInEth = ethers.utils.formatEther(balanceInWei);

  user.send({
    embed: {
      color: constants.SUCCESS_COL,
      description: `Hi, **<@${userId}>** Your balance (${networkName.toUpperCase()}) is ${balanceInEth} SYS. \n ${tokenBalancesStr.join(
        "\n"
      )}`,
    },
  });

  if (message.channel.type !== "dm") {
    message.channel
      .send({
        embed: {
          color: constants.SUCCESS_COL,
          description: `:rolling_eyes::point_up: <@${message.author.id}>, I've sent your balance in a private message.`,
        },
      })
      .then((msg) => {
        utils.deleteMsgAfterDelay(msg, 15000);
      });
  }
}

module.exports = balance;
