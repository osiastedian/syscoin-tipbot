/**
 * Filename: server.js
 * Description: Syscoin-based Discord Tip Bot
 * Coded by: jg
 * Edited: 04/17/2021
 *
 * Before running this bot for the first time please ensure that you create a new
 * 12 word Syscoin mnemonic in config.json and create a safe, secure backup of it somewhere,
 * delete the receiveIndex/auctionIndex/tradeIndex files in the ls folder (if there) and have a new MongoDB database
 * running in the background (once MongoDB is installed it can normally be done with 'sudo service mongod start').
 * The config.json file must also be configured to the Discord server you are running.
 **/

// variables
const c = require("./c.json");
const config = require("./config.json");
var prefix = config.prefix;
const MESSAGE_CHAR_LIMIT = 1980;
const FOUNDATION_ADD = "sys1q6u9ey7qjh3fmnz5gsghcmpnjlh2akem4xm38sw";

// requires
const express = require("express");
const ethers = require("ethers");

const provider = new ethers.providers.JsonRpcProvider(config.nevm.rpcUrl);

const BigNumber = require("bignumber.js");
BigNumber.config({ DECIMAL_PLACES: 8 });
BigNumber.config({ EXPONENTIAL_AT: 1e9 });

const app = express();
app.use(express.static("public"));
app.get("/", function (request, response) {
  response.send("Running botserver");
});

const listener = app.listen(process.env.PORT, function () {
  console.log("Listening on port " + listener.address().port);
});

if (typeof localStorage === "undefined" || localStorage === null) {
  var LocalStorage = require("node-localstorage").LocalStorage;
  localStorage = new LocalStorage("./ls");
  var ls = require("./ls");
}

// Discord.js initialized
const Discord = require("discord.js");
const client = new Discord.Client();

const db = require("./db.js");
db.connect();

// blockbook URL
const backendURL = config.blockURL;
// 'null' for no password encryption for local storage and 'true' for testnet

const auctions = require("./auctions.js");
const missions = require("./missions.js");

const utils = require("./utils.js");
const nevm = require("./nevm");

// Constants required
const constants = require("./constants");
const Log = require("./log");

// constant functions - split string
const splitString = (string, prepend = "", append = "") => {
  if (string.length <= MESSAGE_CHAR_LIMIT) {
    return [string];
  }
  const splitIndex = string.lastIndexOf(
    "\n",
    MESSAGE_CHAR_LIMIT - prepend.length - append.length
  );
  const sliceEnd =
    splitIndex > 0
      ? splitIndex
      : MESSAGE_CHAR_LIMIT - prepend.length - append.length;
  const rest = splitString(string.slice(sliceEnd), prepend, append);

  return [
    `${string.slice(0, sliceEnd)}${append}`,
    `${prepend}${rest[0]}`,
    ...rest.slice(1),
  ];
};

// check if a profile with the given userid exists
async function ifProfile(userId) {
  try {
    let profile = await db.getProfile(userId);
    if (profile) {
      return profile;
    } else {
      return false;
    }
  } catch (error) {
    console.log(error);
    return false;
  }
}

process.on("SIGINT", function () {
  console.log("Caught interrupt signal");
  process.exit();
});

client.on("ready", () => {
  console.log("Up and running!");

  // set name if not properly set
  if (client.user.username !== config.botname) {
    client.user.setUsername(config.botname);
  }

  // set status
  client.user.setActivity(`#tips - !help `, { type: "PLAYING" });
});

client.on("message", async (message) => {
  try {
    if (message.author.bot) {
      return;
    } // no bots
    // if a user posts in the mission channel with an active mission name
    // add them to the mission
    if (message.channel.id == config.missionReportsChannel) {
      await missions.reportSubmit(message);
    }

    var splitter = message.content.replace(" ", ":splitter185151813367::");
    var fixspaces = splitter.replace(
      ":splitter185151813367:::splitter185151813367::",
      ":splitter185151813367::"
    );
    var splitted = fixspaces.split(":splitter185151813367::");

    //  var splitted = splitter.split(":splitter185151813367::")
    var prefix = config.prefix;
    var fixRegExp = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    var re = new RegExp(fixRegExp);
    var command = splitted[0].replace(re, "");
    if (splitted[1]) {
      var args = splitted[1].split(" ").filter((a) => a.length !== 0);
    } else {
      var args = false;
    }

    // fix double space
    if (args[0] == "") {
      args.shift();
    }

    if (message.author.bot) {
      return false;
    }
    var works = false;

    if ((!splitted[0] || !splitted[0].match(prefix)) && !works) {
      return false;
      //No prefix detected
    }

    //Check for command:
    switch (command) {
      case "msgdbg": {
        Log.debug(message, message.member);
        return;
      }
      case "help":
        switch (message.channel.id) {
          case config.tradeChannel:
          case config.auctionChannel:
            message.channel.send({
              embed: {
                color: c.SUCCESS_COL,
                description: `${command} command is not supported.`,
              },
            });
            break;

          case config.missionChannel:
            message.channel.send({
              embed: {
                color: c.SUCCESS_COL,
                description: constants.help("mission"),
              },
            });
            break;

          case config.tipChannel:
          default: {
            message.channel.send({
              embed: {
                color: c.SUCCESS_COL,
                description: constants.help("main"),
              },
            });
            break;
          }
        }
        break;

      case "adminhelp":
        if (message.member.roles.cache.has(config.adminRoleID)) {
          message.channel.send({
            embed: {
              color: c.SUCCESS_COL,
              description: constants.help("admin"),
            },
          });
        }
        break;

      case "dep":
      case "deposit":
        nevm.deposit(message);
        break;

      case "withdraw":
      case "withdrawal":
        // withdraws the specified amount of SYS and SPTs from a user's tipbot account

        return nevm.withdraw(client, message, args, provider);

      case "bal":
      case "balance":
        // used to check a user's balance and to deposit tokens if they have any in their deposit address
        // will then change the deposit address to a new receive address
        return nevm.balance(client, message, args, provider);

      case "foundation":
        let backendAccount = null;
        let balanceStr = "";
        try {
          backendAccount = await sjs.utils.fetchBackendAccount(
            backendURL,
            (
              await db.getProfile(message.author.id)
            ).address,
            {}
          );
        } catch (error) {
          console.log("Error getting foundation account");
          console.log(error);
        }

        let infoStr =
          `The Syscoin Foundation is the official body representing Syscoin Platform. The board is broadly responsible for the growth and adoption of the platform, and its members play a guiding and steering role in its development.` +
          `\nThe bigger their warchest the more effect they can have in the development, promotion and adoption of Syscoin. Any donations will be very much appreciated!` +
          `\n\nFoundation address:\n\n${FOUNDATION_ADD}`;
        if (backendAccount) {
          var bal = utils.toWholeUnit(new BigNumber(backendAccount.balance), 8);
          balanceStr = `\n\nThe Syscoin Foundation currently has ${bal} ${config.ctick}.`;
          infoStr += balanceStr;
        }
        message.channel
          .send({
            embed: {
              color: c.SUCCESS_COL,
              title: "Syscoin Foundation",
              description: infoStr,
            },
          })
          .then((msg) => {
            utils.deleteMsgAfterDelay(msg, 25000);
          });
        break;

      case "create":
      case "createmission":
        // create mission
        if (message.channel.id == config.missionChannel) {
          missions.createOrEditMission(args, message, client);
        }
        break;

      case "edit":
      case "editmission":
        // edit a mission
        if (message.channel.id == config.missionChannel) {
          missions.createOrEditMission(args, message, client, true);
        }
        break;

      case "missions":
        // list all active missions
        if (message.channel.id == config.missionChannel) {
          missions.listMissions(args, message, client);
        }
        break;

      case "missionarchive":
        // list all archived missions
        if (message.channel.id == config.missionChannel) {
          missions.missionArchive(args, message, client);
        }
        break;

      case "remove":
        // remove a profile from the given mission
        if (message.channel.id == config.missionChannel) {
          missions.removeFromMission(args, message, client);
        }
        break;

      case "add":
        // add a profile to a given mission
        if (message.channel.id == config.missionChannel) {
          missions.addToMission(args, message, client);
        }
        break;

      case "list":
        // show all details of a mission, or print all active missions
        if (message.channel.id == config.missionChannel) {
          if (args.length > 0) {
            missions.printMissionDetails(args, message, client);
          } else {
            missions.listMissions(args, message, client);
          }
        }

        // retrieves and prints a list of the auctions that will be ending soon
        if (message.channel.id == config.auctionChannel) {
          auctions.endingSoon(message, client);
        }
        break;

      case "pay":
      case "paymission":
        // pay mission
        if (message.channel.id == config.missionChannel) {
          missions.payMission(args, message, client, false, provider);
        }
        break;

      case "archive":
        // archive mission
        if (message.channel.id == config.missionChannel) {
          missions.archiveMission(args, message, client);
        }
        break;

      case "restrict":
        // restrict a user from using the tipbot functions

        try {
          if (!utils.checkAdminRole(message)) {
            message.channel
              .send({
                embed: {
                  color: c.FAIL_COL,
                  description:
                    "Sorry, you do not have the required permission.",
                },
              })
              .then((msg) => {
                utils.deleteMsgAfterDelay(msg, 15000);
              });
            return;
          }

          var mod = await db.getProfile(message.author.id);
          if (args[0] && mod) {
            let now = new Date();
            let nameID = args[0].replace(/<@!|>/gi, "");

            client.users.fetch(nameID).then(async (user) => {
              var userProfile = await db.getProfile(user.id);
              if (userProfile) {
                userProfile.restricted = true;
                let profile = await db.editProfile(
                  user.id,
                  userProfile.address,
                  userProfile.restricted
                );
                if (profile.restricted) {
                  message.channel.send({
                    embed: {
                      color: c.SUCCESS_COL,
                      description: `:warning: Okay, <@${nameID}> has been restricted from collecting rain until further notice. Please contact a member of the Syscoin team!`,
                    },
                  });
                  user.send({
                    embed: {
                      color: c.FAIL_COL,
                      description: `:warning: Your tipbot account has been restricted! Please contact a member of the Syscoin team!`,
                    },
                  });
                  var actionStr = `Restrict: by mod ${message.author.id}`;
                  let log = await db.createLog(message.author.id, actionStr, [
                    user.id,
                  ]);
                }
              } else {
                message.author
                  .send({
                    embed: {
                      color: c.FAIL_COL,
                      description: `:warning: The user you are attempting to restrict is not a registered user.`,
                    },
                  })
                  .then((msg) => {
                    utils.deleteMsgAfterDelay(msg, 15000);
                  });
              }
            });
          }
        } catch (error) {
          console.log(error);
        }
        break;

      case "check":
        // check if a user has been restricted or not

        try {
          if (!utils.checkAdminRole(message)) {
            message.channel
              .send({
                embed: {
                  color: c.FAIL_COL,
                  description:
                    "Sorry, you do not have the required permission.",
                },
              })
              .then((msg) => {
                utils.deleteMsgAfterDelay(msg, 15000);
              });
            return;
          }

          let nameID = args[0].replace(/<@!|>/gi, "");
          let checkProfile = await db.getProfile(nameID);

          if (checkProfile != undefined) {
            var restricted = checkProfile.restricted;
            if (restricted) {
              message.channel.send({
                embed: {
                  color: c.FAIL_COL,
                  description: `<@${nameID}> is on the restricted list.`,
                },
              });
            } else {
              message.channel.send({
                embed: {
                  color: c.SUCCESS_COL,
                  description: `<@${nameID}> is registered and not restricted.`,
                },
              });
            }
          } else {
            message.channel
              .send({
                embed: {
                  color: c.FAIL_COL,
                  description: `<@${nameID}> has not registered with me!  User must type **${prefix}register**`,
                },
              })
              .then((msg) => {
                utils.deleteMsgAfterDelay(msg, 15000);
              });
          }
        } catch (error) {
          console.log(error);
        }
        break;

      case "unrestrict":
        // unrestrict a user from using the tipbot functions

        try {
          if (!utils.checkAdminRole(message)) {
            message.channel
              .send({
                embed: {
                  color: c.FAIL_COL,
                  description:
                    "Sorry, you do not have the required permission.",
                },
              })
              .then((msg) => {
                utils.deleteMsgAfterDelay(msg, 15000);
              });
            return;
          }

          var mod = await db.getProfile(message.author.id);
          if (args[0] && mod) {
            let now = new Date();
            let nameID = args[0].replace(/<@!|>/gi, "");

            client.users.fetch(nameID).then(async (user) => {
              var userProfile = await db.getProfile(user.id);
              if (userProfile) {
                userProfile.restricted = false;
                let profile = await db.editProfile(
                  user.id,
                  userProfile.address,
                  userProfile.restricted
                );
                if (!profile.restricted) {
                  message.channel.send({
                    embed: {
                      color: c.SUCCESS_COL,
                      description: `Okay, <@${nameID}> has been allowed to collect rain.`,
                    },
                  });
                  user.send({
                    embed: {
                      color: c.SUCCESS_COL,
                      description: `:fireworks: Your tipbot account is no longer restricted!  Please follow the Syscoin rules!`,
                    },
                  });
                  var actionStr = `Unrestrict: by mod ${message.author.id}`;
                  let log = await db.createLog(message.author.id, actionStr, [
                    user.id,
                  ]);
                }
              } else {
                message.author
                  .send({
                    embed: {
                      color: c.FAIL_COL,
                      description: `:warning: The user you are attempting to unrestrict is not a valid user.`,
                    },
                  })
                  .then((msg) => {
                    utils.deleteMsgAfterDelay(msg, 15000);
                  });
              }
            });
          }
        } catch (error) {
          console.log(error);
        }
        break;

      case "ping":
        const m = await message.channel.send("Ping...");
        m.edit(
          `Pong! Latency is ${
            m.createdTimestamp - message.createdTimestamp
          }ms. API Latency is ${Math.round(client.ping)}ms`
        );
        break;

      case "pingstat":
        var statistics = require("./statistics");
        var Bot = new statistics.Bot(client);
        message.channel.send(statistics.view(Bot));
        break;

      case "tip":
      case "send":
        // used to send a SYS or SPT tip to another user's tipbot account

        try {
          if (message.channel.type === "dm") {
            message.channel
              .send({
                embed: {
                  color: c.FAIL_COL,
                  description:
                    ":rolling_eyes::point_up: Sorry but this command only works in the public channel.",
                },
              })
              .then((msg) => {
                utils.deleteMsgAfterDelay(msg, 15000);
              });
            return;
          }
          console.log("Message Channel Id", {
            channelId: message.channel.id,
            content: message.content,
            args: args,
          });

          var myProfile = await db.getProfile(message.author.id);
          if (myProfile.restricted) {
            message.channel
              .send({
                embed: {
                  color: c.FAIL_COL,
                  description:
                    "<@" +
                    message.author.id +
                    "> Sorry, your account has been restricted.  Please contact a member of the Syscoin Team.",
                },
              })
              .then((msg) => {
                utils.deleteMsgAfterDelay(msg, 15000);
              });
            return;
          }

          var receiver = message.mentions.users.first();
          if (!receiver) {
            message.channel
              .send({
                embed: {
                  color: c.FAIL_COL,
                  description:
                    "Please specify a valid user and " +
                    config.ctick +
                    "/token amount to tip them.\nUse `" +
                    prefix +
                    "tip [user] [amount] [symbol/guid]` to continue.\nExample: `" +
                    prefix +
                    "tip @jagatoshi 100 sys`",
                },
              })
              .then((msg) => {
                utils.deleteMsgAfterDelay(msg, 15000);
              });
            return;
          }
          if (receiver.id == message.author.id) {
            message.channel
              .send({
                embed: {
                  color: c.FAIL_COL,
                  description: "You cannot tip yourself.",
                },
              })
              .then((msg) => {
                utils.deleteMsgAfterDelay(msg, 15000);
              });
            return;
          }
          console.log("tip amount", {
            arg: args[1],
            bn: new BigNumber(parseFloat(args[1])),
          });
          args[1] = new BigNumber(args[1]);

          if (args[1].isNaN()) {
            message.channel
              .send({
                embed: {
                  color: c.FAIL_COL,
                  description:
                    "Please ensure you have entered a valid number that is more than 0 for the tip amount.",
                },
              })
              .then((msg) => {
                utils.deleteMsgAfterDelay(msg, 15000);
              });
            return;
          }
          if (args[1].lt(config.tipMin)) {
            message.channel
              .send({
                embed: {
                  color: c.FAIL_COL,
                  description:
                    "You must tip at least " +
                    config.tipMin +
                    " " +
                    config.ctick +
                    ". Too much dust will make it messy in here.",
                },
              })
              .then((msg) => {
                utils.deleteMsgAfterDelay(msg, 15000);
              });
            return;
          }

          return await nevm.send(
            client,
            message,
            args,
            myProfile,
            await ifProfile(receiver.id),
            provider
          );
        } catch (error) {
          console.log(error);
        }
        break;

      case "reg":
      case "register":
        try {
          if (
            message.channel.id == config.tipChannel ||
            message.channel.id == config.tradeChannel ||
            message.channel.id == config.auctionChannel ||
            message.channel.id == config.missionChannel ||
            message.channel.id == config.giveawayChannel ||
            message.channel.type === "dm"
          ) {
            let profileExists = await ifProfile(message.author.id);
            if (profileExists) {
              message.channel
                .send({
                  embed: {
                    color: c.FAIL_COL,
                    description:
                      "You already have a " + config.botname + " profile.",
                  },
                })
                .then((msg) => {
                  utils.deleteMsgAfterDelay(msg, 15000);
                });
              return;
            }

            message.channel
              .send({
                embed: {
                  color: c.SUCCESS_COL,
                  description: "Creating your account...",
                },
              })
              .then((msg) => {
                utils.deleteMsgAfterDelay(msg, 15000);
              });

            let profile = db.createProfile(message.author.id);
            let sysBalance = db.createBalance(message.author.id, "SYS", 0);
            client.users.fetch(message.author.id).then((userMsg) => {
              userMsg.send({
                embed: {
                  color: c.SUCCESS_COL,
                  description:
                    "**Hello there <@" +
                    message.author.id +
                    ">!**\n\n" +
                    ":grin: Greetings!  My name is **" +
                    config.botname +
                    "** and I am a bot in the " +
                    config.cname +
                    ` Discord server.  You are now registered and can access all of my commands. (Like **${prefix}help**)` +
                    `\n\n:speech_balloon: All of my commands start with a ${prefix}\n` +
                    "\n:atm: I'm also a pseudo-wallet and you can deposit/withdraw " +
                    config.ctick +
                    " with me!" +
                    "\n\nDisclaimer: This tipbot was coded and is hosted by Syscoin community members. Choosing to use this bot is done at your own risk and the " +
                    "creators and hosters of this bot hold no responsibility if the unlikely loss of funds occurs. Do not send high value amounts of crypto to this bot.",
                },
              });
            });
            var actionStr = `Register: ${message.author.id}`;
            console.log(actionStr);
            let log = await db.createLog(message.author.id, actionStr, []);
            nevm.register(client, message, args);
          }
        } catch (error) {
          console.log(error);
        }
        break;

      case "giveaway": {
        // creates a giveaway that will randomly select a given number of users who react to the message
        // within a given time and will give the specified amount of SYS or SPTs to the selected winners
        const canGiveAway =
          utils.checkAdminRole(message) ||
          utils.checkMissionRunnerRole(message);
        if (!canGiveAway) {
          message.channel
            .send({
              embed: {
                color: c.FAIL_COL,
                description: "Sorry, you do not have the required permission.",
              },
            })
            .then((msg) => {
              utils.deleteMsgAfterDelay(msg, 15000);
            });
          return;
        }

        return await nevm.createGiveAway(message, args, client, provider);
      }

      case "block":
      case "blocks":
      case "blockchain":

      case "trade":
      case "accept":
      case "tradeaccept":
      case "recent":
      case "tradesrecent":
      case "auction":
      case "bid":
      case "cancel":
      case "show":
      case "find":
      case "findold":

      default:
        message.channel.send({
          embed: {
            color: c.SUCCESS_COL,
            description: `${command} command is not supported.`,
          },
        });
        break;
    }
  } catch (err) {
    console.log(`Errors found:\n\`\`\`${err}\nAt ${err.stack}\`\`\``);
  }
});

client.login(config.discordKey);
