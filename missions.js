var exports = (module.exports = {});

const BigNumber = require("bignumber.js");
BigNumber.config({ DECIMAL_PLACES: 8 });
BigNumber.config({ EXPONENTIAL_AT: 1e9 });

const c = require("./c.json");
const com = require("./commandUsage.json");
const config = require("./config.json");
var prefix = config.prefix;

const db = require("./db.js");
const utils = require("./utils.js");
const ethers = require("ethers");
const {
  getDistributorContract,
  getErc20Contract,
} = require("./nevm/utils/contract");
const { registerWallet } = require("./nevm/register");
const { runTransaction } = require("./nevm/utils/transaction");
const Log = require("./log");
const { generateSendTransactionConfig } = require("./nevm/send");

// split array
function arraySplit(list, howMany) {
  var idx = 0;
  result = [];
  while (idx < list.length) {
    if (idx % howMany === 0) result.push([]);
    result[result.length - 1].push(list[idx++]);
  }
  return result;
}

/**
 * command: !create/edit [missionID] [amount] [symbol/guid] [timeAmount][s/m/h/d] <@suggester> <suggestAmount>
 * args
 * 0 - missionID, 1 - amount (whole), 2 - symbol/guid, 3 - timeAmount with s/m/h/d, 5 - suggester payout
 */
exports.createOrEditMission = async function (args, message, client, edit) {
  try {
    if (!utils.checkMissionRole(message)) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description: "Sorry, you do not have the required permission.",
        },
      });
      return;
    }

    if (!utils.hasAllArgs(args, 4)) {
      if (!edit) {
        message.channel.send({
          embed: {
            color: c.FAIL_COL,
            description: `Missing information. Usage: ${config.prefix}${com.createmission}`,
          },
        });
      } else {
        message.channel.send({
          embed: {
            color: c.FAIL_COL,
            description: `Missing information. Usage: ${config.prefix}${com.editmission}`,
          },
        });
      }
      return;
    }

    let [missionName, payout, currency, timeArg, networkName = "nevm"] = args;

    var gCurrency, currencyStr;
    var decimals = 8;

    const networkConfig = config[networkName];

    // set up currency strings and get decimals for converting
    // between whole and sats later
    if (currency) {
      gCurrency = currency.toUpperCase();

      if (gCurrency !== "SYS") {
        const supportedToken = networkConfig.supportedTokens.find(
          (token) => token.symbol === gCurrency
        );
        if (!supportedToken) {
          message.reply(
            `Couldn't find the token: ${gCurrency}. Please ensure you entered the symbol correctly.`
          );
          return;
        }
        decimals = supportedToken.decimals;
        currencyStr = supportedToken.symbol;
      } else {
        currencyStr = "SYS";
      }
    } else {
      decimals = 8;
      gCurrency = "SYS";
      currencyStr = "SYS";
    }

    if (missionName == undefined) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description: `Sorry, you must specify a mission name (one word) with a payout, i.e. ${prefix}createmission m75 2 SYS`,
        },
      });
      return;
    }

    missionName = missionName.toUpperCase();

    if (missionName.includes("@")) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description: `Mission name cannot include a user, use this format: ${prefix}add mission10 @user`,
        },
      });
      return;
    }

    // if it isn't an edit operation then make sure mission doesn't already exist
    var mission = await db.getMission(missionName);
    if (!edit) {
      if (mission) {
        message.channel.send({
          embed: {
            color: c.FAIL_COL,
            description: "That mission has already been created.",
          },
        });
        return;
      }
    }

    if (payout == undefined) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description: `Sorry, you must specify a mission payout, i.e. ${prefix}createmission m75 10 SYS`,
        },
      });
      return;
    }

    let payoutBig = new BigNumber(payout);

    // time object storing the length and unit of time
    var time = {
      amount: new BigNumber(parseInt(timeArg.substr(0, timeArg.length - 1))),
      unit: timeArg.substr(timeArg.length - 1, timeArg.length).toUpperCase(),
    };

    var timeMilliSeconds = utils.convertToMillisecs(time.amount, time.unit);

    var amountStr = ["payout", "time amount"];
    var amounts = [payoutBig, timeMilliSeconds];

    var suggester = message.mentions.users.first();
    var suggesterID = null;
    var suggesterPayout = null;
    if (suggester) {
      suggesterPayout = new BigNumber(args[5]);
      amountStr.push("suggester payout");
      amounts.push(suggesterPayout);
      suggesterID = suggester.id;
    }

    // check to ensure the amount arguments are valid
    for (var i = 0; i < amounts.length; i++) {
      if (amounts[i].isNaN()) {
        message.channel.send({
          embed: {
            color: c.FAIL_COL,
            description: `The ${amountStr[i]} given is not a number.`,
          },
        });
        return;
      }

      if (!amounts[i].gt(0)) {
        message.channel.send({
          embed: {
            color: c.FAIL_COL,
            description: `The ${amountStr[i]} given isn't more than 0.`,
          },
        });
        return;
      }
    }

    // check to ensure the time isn't longer than it can be
    if (
      timeMilliSeconds.gt(
        utils.convertToMillisecs(new BigNumber(config.maxAuctionTimeDays), "d")
      )
    ) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description: `The max auction time is ${config.maxAuctionTimeDays} day(s). Try again with a lower auction time.`,
        },
      });
      return;
    }

    // check to ensure the decimals of the amount given are valid, i.e. there can't be
    // more decimals than is possible, or than the max decimals allowed by the tipbot
    var decimalCount = utils.decimalCount(payoutBig.toString());
    if (decimalCount > decimals) {
      if (decimals > 0) {
        if (decimals > config.tipMaxDecimals) {
          message.channel.send({
            embed: {
              color: c.FAIL_COL,
              description: `You are trying to use too many decimals for the payout amount. We don't want it dusty in here so the current max tipbot decimal count is ${config.tipMaxDecimals}.`,
            },
          });
        } else {
          message.channel.send({
            embed: {
              color: c.FAIL_COL,
              description: `You are trying to use too many decimals payout amount. It can't have any more than ${decimals} decimals.`,
            },
          });
        }
      } else {
        message.channel.send({
          embed: {
            color: c.FAIL_COL,
            description: `${currencyStr} is a non-divisible token. It can't have any decimals.`,
          },
        });
      }
      return;
    }

    if (decimalCount > config.tipMaxDecimals) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description: `You are trying to use too many decimals for the payout amount. We don't want it dusty in here so the current max tipbot decimal count is ${config.tipMaxDecimals}.`,
        },
      });
      return;
    }

    const now = Date.now();
    const endDate = new Date(timeMilliSeconds.plus(now).toNumber());

    let value = ethers.utils.parseEther(payoutBig.toString());
    let suggestValue = null;
    if (suggester) {
      suggestValue = ethers.utils.parseEther(suggesterPayout.toString());
    }
    let missionNew;
    if (!edit) {
      missionNew = await db.createMission(
        missionName,
        message.author.id,
        value,
        gCurrency,
        endDate,
        suggesterID,
        suggestValue,
        networkName
      );

      if (suggesterID !== null) {
        const suggesterNevmWallet = await db.nevm.getNevmWallet(suggesterID);
        if (!suggesterNevmWallet) {
          const infoMessage = await message.reply({
            embed: {
              description: `It seems @<${suggesterID}> don't have an NEVM wallet for this Mission.`,
            },
          });
          await registerWallet(suggesterID);
          await infoMessage.reply({
            embed: {
              color: c.SUCCESS_COL,
              description: `Automatically created @<${suggesterID}>'s NEVM Wallet. Please run \`!deposit nevm\` to check your addresss.`,
            },
          });
        }
      }
    } else {
      missionNew = await db.editMission(
        missionName,
        value,
        gCurrency,
        endDate,
        suggesterID,
        suggestValue
      );
    }

    if (missionNew) {
      message.channel.send({
        embed: {
          color: c.SUCCESS_COL,
          description:
            ":fireworks: Created/edited a mission named: **" +
            missionName +
            "**",
        },
      });
    } else {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description:
            "Creation/editing of mission failed: **" + missionName + "**",
        },
      });
    }
  } catch (error) {
    console.log(error);
    message.channel.send({
      embed: {
        color: c.FAIL_COL,
        description: "Error creating/editing mission.",
      },
    });
  }
};

// lists the detais of a mission, or if no mission is given it will return a list of
// active missions
/**
 * command: !list <missionID>
 * args
 * 0 - missionID (optional)
 */
exports.listMissions = async function (args, message, client) {
  try {
    if (!utils.checkMissionRole(message)) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description: "Sorry, you do not have the required permission.",
        },
      });
      return;
    }

    let activeMissions = await db.getAllActiveMissions();

    let missionMessageList = "";

    config.evmNetworks.forEach((networkName) => {
      missionMessageList += `\n${networkName.toUpperCase()}:\n`;

      activeMissions.forEach((activeMission) => {
        if ((activeMission.networkName || "nevm") === networkName) {
          const remainingTime = utils.getTimeDiffStr(activeMission.endTime);
          const line = ` ***${activeMission.missionID}***: ends in ${remainingTime}\n`;
          missionMessageList += line;
        }
      });
    });

    message.channel.send({
      embed: {
        color: c.SUCCESS_COL,
        description: `Here are the active missions: \n ${missionMessageList}`,
      },
    });
  } catch (error) {
    console.log(error);
    message.channel.send({
      embed: { color: c.FAIL_COL, description: "Error listing missions." },
    });
  }
};

// archives a specific mission
/**
 * command: !archive [missionID]
 * args
 * 0 - missionID
 */
exports.missionArchive = async function (args, message, client) {
  try {
    if (!utils.checkMissionRole(message)) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description: "Sorry, you do not have the required permission.",
        },
      });
      return;
    }

    let archivedMissions = await db.getAllArchivedMissions();

    var txtList = "";
    for (i = 0; i < archivedMissions.length; i++) {
      txtList += " " + archivedMissions[i].missionID + " |";
    }

    message.channel.send({
      embed: {
        color: c.SUCCESS_COL,
        description: "Here are the archived mission names: \n" + txtList,
      },
    });
  } catch (error) {
    console.log(error);
    message.channel.send({
      embed: { color: c.FAIL_COL, description: "Error archiving mission." },
    });
  }
};

// removes a specific user profile from a mission
/**
 * command: !remove [missionID] @user
 * args
 * 0 - missionID, 1 - @user
 */
exports.removeFromMission = async function (args, message, client) {
  try {
    if (!utils.checkMissionRole(message)) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description: "Sorry, you do not have the required permission.",
        },
      });
      return;
    }

    var missionName = args[0];
    var user = args[1];

    if (missionName == undefined) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description: `Please use this format to remove a user from mission: ${prefix}remove mission10 @user`,
        },
      });
      return;
    }

    missionName = missionName.toUpperCase();

    var mission = await db.getMission(missionName);
    if (!mission) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description:
            "Sorry, that mission does not exist or has been archived.",
        },
      });
      return;
    }

    if (user == undefined) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description: `Please use this format to remove a user from mission: ${prefix}remove mission10 @user`,
        },
      });
      return;
    }

    var userID = user.replace(/<@|!|>/gi, "");
    var profileInMission = await db.checkProfileInMission(userID, missionName);
    if (!profileInMission) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description:
            "Sorry, <@" +
            userID +
            "> is not in mission: **" +
            missionName +
            "**",
        },
      });
      return;
    }

    var missionEdited = await db.removeProfileFromMission(userID, missionName);

    if (missionEdited) {
      message.channel.send({
        embed: {
          color: c.SUCCESS_COL,
          description:
            "Removed user from mission " +
            missionName +
            ": **<@" +
            userID +
            ">**",
        },
      });
    } else {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description: `Error removing <@${userID}> from mission ${missionName}`,
        },
      });
    }
  } catch (error) {
    console.log(error);
    message.channel.send({
      embed: { color: c.FAIL_COL, description: "Error removing from mission." },
    });
  }
};

// adds a specific user profile to the mission
/**
 * command: !add [missionID] @user
 * args
 * 0 - missionID, 1 - @user
 */
exports.addToMission = async function (args, message, client) {
  try {
    if (!utils.checkMissionRole(message)) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description: "Sorry, you do not have the required permission.",
        },
      });
      return;
    }

    var missionName = args[0];
    var user = args[1];

    if (missionName == undefined) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description: `Please use this format to add a user from mission: ${prefix}add mission10 @user`,
        },
      });
      return;
    }

    missionName = missionName.toUpperCase();

    var mission = await db.getMission(missionName);
    if (!mission) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description:
            "Sorry, that mission does not exist or has been archived.",
        },
      });
      return;
    }

    if (user == undefined) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description: `Please use this format to add a user from mission: ${prefix}add mission10 @user`,
        },
      });
      return;
    }
    var userID = user.replace(/<@|!|>/gi, "");
    var profileInMission = await db.checkProfileInMission(userID, missionName);
    if (profileInMission) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description:
            "Sorry, <@" +
            userID +
            "> is already in mission: **" +
            missionName +
            "**",
        },
      });
      return;
    }
    var missionEdited = await db.addProfileToMission(userID, missionName);

    if (missionEdited) {
      message.channel.send({
        embed: {
          color: c.SUCCESS_COL,
          description:
            "Added user to mission " + missionName + ": **<@" + userID + ">**",
        },
      });
    } else {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description: `Error adding <@${userID}> to mission ${missionName}`,
        },
      });
    }
  } catch (error) {
    console.log(error);
    message.channel.send({
      embed: { color: c.FAIL_COL, description: "Error adding to mission." },
    });
  }
};

// prints the details of a given mission
/**
 * command: !list <missionID>
 * args
 * 0 - missionID (optional)
 */
exports.printMissionDetails = async function (args, message, client) {
  try {
    if (!utils.checkMissionRole(message)) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description: "Sorry, you do not have the required permission.",
        },
      });
      return;
    }

    var missionName = args[0].toUpperCase();
    if (missionName == undefined) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description: `Please use this format to show mission users: ${prefix}list m10`,
        },
      });
      return;
    }
    const mission = await db.getMission(missionName);

    if (!mission) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description:
            "Sorry, that mission does not exist or has been archived.",
        },
      });
      return;
    }

    // set up currency string and get the decimals for converting between
    // wholeUnit and sats later on
    let token,
      decimals,
      currencyStr = "SYS";
    const networkConfig = config[mission.networkName];
    if (mission.currencyID !== "SYS") {
      token = networkConfig.supportedTokens.find(
        (token) => token.symbol === mission.currencyID
      );
      if (token) {
        currencyStr = token.symbol;
        decimals = token.decimals;
      }
    }

    const payoutWhole = ethers.utils.formatEther(mission.reward);

    var missionProfiles = await db.getMissionProfiles(missionName);
    var txtUsers = "";
    missionProfiles.forEach((profile) => {
      txtUsers = txtUsers + "<@" + profile.userID + "> ";
    });

    // get the time remaining until the mission ends
    var remainingTime = utils.getTimeDiffStr(mission.endTime);

    if (mission.suggesterID) {
      var suggesterPayoutWhole = utils.toWholeUnit(
        new BigNumber(mission.suggesterPayout),
        decimals
      );
      message.channel.send({
        embed: {
          color: c.SUCCESS_COL,
          title: `${mission.missionID}`,
          description: `Ending in: ${remainingTime}\nTotal payout: ${payoutWhole} ${currencyStr}\nSuggester <@${mission.suggesterID}> will receive ${suggesterPayoutWhole} ${currencyStr}\n** ${missionProfiles.length} ** users in mission ** ${missionName} ** listed below: `,
        },
      });
    } else {
      message.channel.send({
        embed: {
          color: c.SUCCESS_COL,
          title: `${mission.missionID}`,
          description: `Ending in: ${remainingTime}\nTotal payout: ${payoutWhole} ${currencyStr}\n** ${missionProfiles.length} ** users in mission ** ${missionName} ** listed below: `,
        },
      });
    }

    if (missionProfiles.length > 0) {
      //split into groups of 50 users for discord limit
      var users = txtUsers.split(" ");
      var splitUsers = arraySplit(users, 50);
      splitUsers.forEach((arr) => {
        var line = "";
        arr.forEach((user) => {
          line = line + user + " ";
        });
        message.channel.send({
          embed: { color: c.SUCCESS_COL, description: line },
        });
      });
    }
  } catch (error) {
    console.log(error);
    message.channel.send({
      embed: { color: c.FAIL_COL, description: "Error listing missions." },
    });
  }
};

/**
 *
 * @param {Discord.Message} message
 * @param {string} missionName
 * @returns {Promise<any[]>} profiles
 */
const getMissionProfiles = async (message, missionName) => {
  const missionProfiles = await db.getMissionProfiles(missionName);
  if (process.env.NODE_ENV === "development") {
    return missionProfiles;
  }
  return missionProfiles.filter(
    (profile) => profile.userID !== message.author.id
  );
};

/**
 *
 * @param {Discord.Message} message
 */
const sendInvalidParticipationMessage = (message) => {
  message.channel.send({
    embed: {
      color: c.FAIL_COL,
      description: "Nobody took part in the mission, there's nobody to pay!",
    },
  });
};

/**
 *
 * @param {Discord.Message} message
 */
const sendInvalidTipMessage = (message) => {
  message.channel.send({
    embed: {
      color: c.FAIL_COL,
      description:
        "The mission payout per participant is below the minimum tip amount on the tipbot.",
    },
  });
};

/**
 *
 * @param {Discord.Message} message
 * @param {} mission
 */
const sendNotEnoughBalanceMessage = (message, mission) => {
  message.channel.send({
    embed: {
      color: c.FAIL_COL,
      description: `Sorry, you don't have enough funds to pay the mission: ${mission.missionID}!`,
    },
  });
};

/**
 *
 * @param {string[]} addressList
 * @param {ethers.ethers.BigNumber} amountPerReceiver
 * @param {ethers.ethers.BigNumber} value To be sent to contract
 * @param {ethers.providers.JsonRpcProvider} jsonRpc
 */
const generateDistributeFundsTransaction = async (
  addressList,
  amountPerReceiver,
  value,
  networkConfig
) => {
  const jsonRpc = new ethers.providers.JsonRpcProvider(networkConfig.rpcUrl);
  const distributorContract = getDistributorContract(
    networkConfig.distributor.address,
    jsonRpc
  );

  const gasLimit = await distributorContract.estimateGas
    .distribute(amountPerReceiver, addressList, { value })
    .catch(() =>
      Promise.resolve(
        networkConfig.distributor.gasLimit +
          addressList.length * networkConfig.distributor.additionalGasPerAddress
      )
    );

  const gasPrice = await jsonRpc.getGasPrice();
  const { maxFeePerGas, maxPriorityFeePerGas } = await jsonRpc.getFeeData();

  // ethers.UnsignedTransaction
  const transactionConfig = {
    type: 2,
    chainId: networkConfig.chainId,
    value,
    gasLimit,
    gasPrice: maxFeePerGas ?? gasPrice,
    maxFeePerGas: maxFeePerGas ?? gasPrice,
    maxPriorityFeePerGas:
      maxPriorityFeePerGas ??
      ethers.utils.parseUnits(
        networkConfig.distributor.missions.maxPriorityFeePerGasInGwei,
        "gwei"
      ),
  };

  const distributeTransactionConfig =
    await distributorContract.populateTransaction.distribute(
      amountPerReceiver,
      addressList,
      { value }
    );

  return {
    ...transactionConfig,
    value,
    ...distributeTransactionConfig,
  };
};

const generateSetTokenAllownce = async (
  creatorAddress,
  tokenAddress,
  amount,
  networkConfig
) => {
  const jsonRpc = new ethers.providers.JsonRpcProvider(networkConfig.rpcUrl);
  const transactionConfig = {
    type: 2,
    chainId: networkConfig.chainId,
    gasLimit: networkConfig.tokenApproveGasLimit,
    maxFeePerGas: ethers.utils.parseUnits("2.56", "gwei"),
    maxPriorityFeePerGas: ethers.utils.parseUnits("2.5", "gwei"),
  };
  const tokenContract = await getErc20Contract(tokenAddress, jsonRpc);
  const approveTransactionConfig =
    await tokenContract.populateTransaction.approve(
      networkConfig.distributor.address,
      amount
    );

  return { ...transactionConfig, ...approveTransactionConfig };
};

const generateDistributeTokensTransaction = async (
  creatorAddress,
  addressList,
  amountPerReceiver,
  tokenAddress,
  networkConfig
) => {
  const jsonRpc = new ethers.providers.JsonRpcProvider(networkConfig.rpcUrl);
  const transactionConfig = {
    type: 2,
    chainId: networkConfig.chainId,
    gasLimit:
      networkConfig.distributor.gasLimit +
      addressList.length * networkConfig.tokenGasLimit,
    maxFeePerGas: ethers.utils.parseUnits(
      networkConfig.distributor.missions.maxFeePerGasInGwei,
      "gwei"
    ),
    maxPriorityFeePerGas: ethers.utils.parseUnits(
      networkConfig.distributor.missions.maxPriorityFeePerGasInGwei,
      "gwei"
    ),
  };
  const distributorContract = getDistributorContract(
    networkConfig.distributor.address,
    jsonRpc
  );

  const distributeTransactionConfig =
    await distributorContract.populateTransaction.distributeTokens(
      amountPerReceiver,
      tokenAddress,
      addressList
    );

  return {
    ...transactionConfig,
    ...distributeTransactionConfig,
  };
};

/**
 *
 * @param {Discord.Client} client
 * @param {string} totalAmount
 * @param {string} currencyStr
 * @param {string[]} userList
 */
const sendPayoutmessage = (
  client,
  totalAmount,
  dividedAmount,
  currencyStr,
  missionName,
  userList,
  extraMessage
) => {
  const payoutChannel = client.channels.cache.get(config.missionPayOutsChannel);
  payoutChannel.send({
    embed: {
      color: c.SUCCESS_COL,
      description:
        ":fireworks: :moneybag: Paid **" +
        dividedAmount +
        " " +
        currencyStr +
        "** to " +
        userList.length +
        " users (Total = " +
        totalAmount.toString() +
        " " +
        currencyStr +
        ") in mission **" +
        missionName +
        "** listed below:\n\n" +
        userList.map((userId) => `<@${userId}>`).join("\n") +
        (extraMessage ?? ""),
    },
  });
};

const sendSuggesterPayoutSuccessMessage = async (
  client,
  missionId,
  suggesterId,
  suggesterAmount,
  currencyStr,
  explorerLink
) => {
  const payoutChannel = client.channels.cache.get(config.missionPayOutsChannel);
  payoutChannel.send({
    embed: {
      color: c.SUCCESS_COL,
      description: `Good suggestion! <@${suggesterId}> has been paid ${suggesterAmount} ${currencyStr} for suggesting the mission ${missionId}!\n${explorerLink}`,
    },
  });

  const suggesterUser = await client.users.fetch(suggesterId);
  suggesterUser.send({
    embed: {
      color: c.SUCCESS_COL,
      description: `Suggester Payout for mission: ${missionId} for ${suggesterAmount} ${currencyStr}.\n${explorerLink}`,
    },
  });
};

/**
 *
 * @param {string} symbol
 * @param {string} ownerAddress
 * @param {string} privateKey
 * @param {string[]} addressList
 * @param {string} rewardDividedInWei
 * @param {string} rewardInWei
 * @param {*} jsonRpc
 * @returns
 */
const sendPayoutTransactions = async (
  symbol,
  ownerAddress,
  privateKey,
  addressList,
  rewardDividedInWei,
  rewardInWei,
  networkConfig
) => {
  const jsonRpc = new ethers.providers.JsonRpcProvider(networkConfig.rpcUrl);
  const supportedToken = networkConfig.supportedTokens.find(
    (token) => token.symbol === symbol
  );
  if (supportedToken) {
    const approvalTransaction = await generateSetTokenAllownce(
      ownerAddress,
      supportedToken.address,
      rewardInWei,
      networkConfig
    );
    const approvalReceipt = await runTransaction(
      privateKey,
      approvalTransaction,
      jsonRpc
    ).then((resp) => resp.wait(1));
    Log.debug({ approvalReceipt });

    const distributTokensTransaction =
      await generateDistributeTokensTransaction(
        ownerAddress,
        addressList,
        rewardDividedInWei,
        supportedToken.address,
        networkConfig
      );
    return runTransaction(privateKey, distributTokensTransaction, jsonRpc);
  }

  const distributeTransactionConfig = await generateDistributeFundsTransaction(
    addressList,
    rewardDividedInWei,
    rewardInWei,
    networkConfig
  );

  return runTransaction(privateKey, distributeTransactionConfig, jsonRpc);
};

/**
 *  pays out the previously specified rewards to the participants in the given mission
 * command: !pay <missionID>
 * args
 * 0 - missionID (optional)
 *
 * @param {string[]} args
 * @param {Discord.Message} message
 * @param {Discord.Client} client
 * @param {boolean} automated
 * @returns
 */
exports.payMission = async function (args, message, client, automated) {
  try {
    if (!automated) {
      if (!utils.checkMissionRole(message)) {
        message.channel.send({
          embed: {
            color: c.FAIL_COL,
            description: "Sorry, you do not have the required permission.",
          },
        });
        return;
      }
    }

    var missionName = args[0].toUpperCase();
    if (missionName == undefined) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description: `Please use this format to pay mission: ${prefix}pay m10`,
        },
      });
      return;
    }

    var mission = await db.getMission(missionName);
    if (!mission || !mission.active) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description:
            "Sorry, that mission does not exist or has been archived.",
        },
      });
      return;
    }

    const onMissionPayoutConfirmed = (txHash) => {
      const explorerLink = utils.getNevmExplorerLink(
        txHash,
        "transaction",
        "Click Here to View Transaction",
        mission.networkName
      );
      sendPayoutmessage(
        client,
        ethers.utils.formatEther(rewardInWei),
        ethers.utils.formatEther(rewardDividedInWei),
        mission.currencyID,
        mission.missionID,
        missionProfiles.map((profile) => profile.userID),
        `\n\n${explorerLink}`
      );

      exports.archiveMission(args, message, client, true);
    };

    const creatorWallet = await db.nevm.getNevmWallet(mission.creator);

    const rewardInWei = ethers.utils.parseUnits(mission.reward, "wei");

    const networkName = mission.networkName ?? "nevm";
    const networkConfig = config[networkName];
    const jsonRpc = new ethers.providers.JsonRpcProvider(networkConfig.rpcUrl);

    const balanceInWei = await jsonRpc.getBalance(creatorWallet.address);

    if (balanceInWei.lt(rewardInWei)) {
      sendNotEnoughBalanceMessage(message, mission);
      return;
    }

    const missionProfiles = await getMissionProfiles(message, missionName);

    if (missionProfiles.length === 0) {
      sendInvalidParticipationMessage(message, mission);
      exports.archiveMission([mission.missionID], message, client, true);
      return;
    }

    const rewardDividedInWei = rewardInWei.div(missionProfiles.length);

    if (mission.txHash) {
      return new Promise((resolve) => {
        console.log(
          "PayMission: Waiting for mission payout to be mined ",
          mission.missionID,
          mission.txHash
        );
        const fetchReceipt = () => {
          jsonRpc.getTransactionReceipt(mission.txHash).then((receipt) => {
            if (receipt) {
              resolve(receipt.transactionHash);
            } else {
              setTimeout(fetchReceipt, 10_000);
            }
          });
        };

        fetchReceipt();
      }).then((txHash) => {
        onMissionPayoutConfirmed(txHash);
      });
    }

    const minimumTipInWei = ethers.utils.parseEther(`${config.tipMin}`);

    if (rewardDividedInWei.lt(minimumTipInWei)) {
      sendInvalidTipMessage(message);
      return;
    }

    const nevmWallets = await Promise.all(
      missionProfiles.map((profile) => db.nevm.getNevmWallet(profile.userID))
    );

    const addressList = nevmWallets.map((wallet) => wallet.address);
    console.log({
      creator: creatorWallet.address,
      addressList,
      rewardDividedInWei,
      rewardInWei,
    });

    const creatorUser = await client.users.fetch(mission.creator);

    await sendPayoutTransactions(
      mission.currencyID,
      creatorWallet.address,
      creatorWallet.privateKey,
      addressList,
      rewardDividedInWei,
      rewardInWei,
      networkConfig
    )
      .then(async (response) => {
        console.log(`Mission Payout sent for: ${mission.missionID}!`);
        const explorerLink = utils.getNevmExplorerLink(
          response.hash,
          "transaction",
          "Click Here to View Transaction",
          networkName
        );
        await db.setMissionTxHash(mission.missionID, response.hash);
        creatorUser.send({
          embed: {
            color: c.SUCCESS_COL,
            description: `Payout distribution for mission: ${
              mission.missionID
            } for ${ethers.utils.formatEther(rewardInWei)} ${
              mission.currencyID
            }. Please wait for it to be mined.\n${explorerLink}`,
          },
        });
        return response.wait(1);
      })
      .then((receipt) => {
        onMissionPayoutConfirmed(receipt.transactionHash);
      });

    if (mission.suggesterID) {
      const suggesterNevmWallet = await db.nevm.getNevmWallet(
        mission.suggesterID
      );
      const sendFundTransactionConfig = await generateSendTransactionConfig(
        creatorWallet,
        suggesterNevmWallet,
        mission.currencyID,
        mission.suggesterPayout,
        jsonRpc
      );
      runTransaction(
        creatorWallet.privateKey,
        sendFundTransactionConfig,
        jsonRpc
      )
        .then((response) => {
          console.log(
            `Mission Suggester Payout sent for: ${mission.missionID}!`
          );
          const explorerLink = utils.getNevmExplorerLink(
            response.hash,
            "transaction",
            "Click Here to View Transaction",
            networkName
          );
          creatorUser.send({
            embed: {
              color: c.SUCCESS_COL,
              description: `Suggester Payout for mission: ${
                mission.missionID
              } for ${ethers.utils.formatEther(mission.suggesterPayout)} ${
                mission.currencyID
              }. Please wait for it to be mined.\n${explorerLink}`,
            },
          });
          return response.wait(1);
        })
        .then((receipt) => {
          const amountInEth = ethers.utils.formatEther(mission.suggesterPayout);
          const explorerLink = utils.getNevmExplorerLink(
            receipt.transactionHash,
            "transaction",
            "Click Here to View Transaction",
            networkName
          );
          sendSuggesterPayoutSuccessMessage(
            client,
            mission.missionID,
            mission.suggesterID,
            amountInEth,
            mission.currencyID,
            explorerLink
          );
        });
    }
  } catch (error) {
    const errorMessage = "Error paying mission: " + mission.missionID;
    console.log(errorMessage, error);
    message.channel.send({
      embed: {
        color: c.FAIL_COL,
        description: errorMessage,
      },
    });
  }
};

// archives a specific mission, i.e. it's no longer active and participants can't be added to it
/**
 * command: !archive <missionID>
 * args
 * 0 - missionID (optional)
 */
exports.archiveMission = async function (args, message, client, automated) {
  try {
    if (!automated) {
      if (!utils.checkMissionRole(message)) {
        message.channel.send({
          embed: {
            color: c.FAIL_COL,
            description: "Sorry, you do not have the required permission.",
          },
        });
        return;
      }
    }

    var missionName = args[0];
    if (missionName == undefined) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description: `Sorry, you must specify a mission name to archive, i.e. ${prefix}archive m75`,
        },
      });
      return;
    }

    missionName = missionName.toUpperCase();
    var mission = await db.getMission(missionName);
    if (!mission) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description:
            "Sorry, that mission does not exist or has been archived.",
        },
      });
      return;
    }

    var missionUpdated = await db.archiveMission(missionName);

    if (missionUpdated) {
      message.channel.send({
        embed: {
          color: c.SUCCESS_COL,
          description:
            ":fireworks: The following mission has been archived: **" +
            missionName +
            "**",
        },
      });
    } else {
      message.channel.send({
        embed: { color: c.FAIL_COL, description: "Mission archiving failed." },
      });
    }
  } catch (error) {
    console.log(error);
    message.channel.send({
      embed: { color: c.FAIL_COL, description: "Error archiving mission." },
    });
  }
};

// gets any missions that will be ending within the given limit
// limit is the time given in mins that an auction will be ending by
exports.getEndingSoon = async function getEndingSoon(limit) {
  try {
    var missions = await db.getAllActiveMissions();

    if (!missions || missions === undefined) {
      console.log("Error - cannot fetch active missions to check end times");
    }

    var missionsEnding = [];

    for (var i = 0; i < missions.length; i++) {
      var now = new BigNumber(Date.now());
      var end = new BigNumber(missions[i].endTime.getTime());
      var diff = end.minus(now);

      var secsLeft = diff.dividedBy(1000);

      if (secsLeft.lte(limit)) {
        missionsEnding.push(missions[i]);
      }
    }

    return missionsEnding;
  } catch (error) {
    console.log(error);
  }
};

exports.reportSubmit = async (message) => {
  try {
    const missionName = message.content.trim().split(/\s+/);
    missionName[0] = missionName[0].toUpperCase();
    var mission = await db.getMission(missionName[0]);
    if (mission) {
      if (mission.active) {
        try {
          const wallet = await db.nevm.getNevmWallet(message.author.id);
          if (!wallet) {
            const infoMessage = await message.reply({
              embed: {
                description: `It seems you don't have an NEVM wallet for this Mission.`,
              },
            });
            await registerWallet(message.author.id);
            await infoMessage.reply({
              embed: {
                color: c.SUCCESS_COL,
                description: `Automatically created your NEVM Wallet. Please run \`!deposit nevm\` to check your addresss.`,
              },
            });
          }

          await db.addProfileToMission(message.author.id, missionName[0]);

          utils.isSuccessMsgReact(true, message);
          console.log(`Added ${message.author.id} to mission ${missionName}`);
        } catch (error) {
          utils.isSuccessMsgReact(false, message);
          console.log(
            `Error adding ${message.author.id} to mission ${missionName}`
          );
          console.log(error);
        }
      } else {
        utils.isSuccessMsgReact(false, message);
        message.channel
          .send({
            embed: {
              color: c.FAIL_COL,
              description: `Mission ${missionName[0]} is no longer active.`,
            },
          })
          .then((msg) => {
            utils.deleteMsgAfterDelay(msg, 15000);
          });
      }
    } else {
      console.log(`Mission ${missionName} not found`);
    }
  } catch (error) {
    utils.isSuccessMsgReact(false, message);
    console.log(error);
    message.channel
      .send({
        embed: {
          color: c.FAIL_COL,
          description: "Error adding to mission.",
        },
      })
      .then((msg) => {
        utils.deleteMsgAfterDelay(msg, 15000);
      });
  }
};
