const db = require("../db");
const constants = require("../c.json");
const config = require("../config.json");
const utils = require("../utils");
const HDWallet = require("ethereum-hdwallet");

const { messages, applyContext } = require("../constants");

const tipbotWallet = HDWallet.fromMnemonic(config.ethMnemonic).derive(
  HDWallet.DefaultHDPath
);

const registerWallet = async (userId) => {
  const count = await db.nevm.getNevmWalletCount();
  const newWallet = tipbotWallet.derive(count);

  return db.nevm.createNevmWallet(
    userId,
    `0x${newWallet.getAddress().toString("hex")}`,
    `0x${newWallet.getPrivateKey().toString("hex")}`
  );
};

/**
 *
 * @param {Discord.Client} client
 * @param {Discord.Message} message
 * @param {string[]} args
 */
async function registerNevm(client, message, args) {
  const userId = message.author.id;
  let nevmWallet = await db.nevm.getNevmWallet(userId);
  if (nevmWallet) {
    message.channel
      .send({
        embed: {
          color: constants.FAIL_COL,
          description: applyContext(
            messages["register.error.registered"],
            config
          ),
        },
      })
      .then((msg) => {
        utils.deleteMsgAfterDelay(msg, 15000);
      });
    return;
  }

  nevmWallet = registerWallet(message.author.id);

  if (!nevmWallet) {
    console.error("registerNevm", "Wallet creation failed");
    return;
  }

  const user = await client.users.fetch(message.author.id);
  user.send({
    embed: {
      color: constants.SUCCESS_COL,
      description: applyContext(messages["register.success"], config),
    },
  });
}

module.exports = {
  registerNevm,
  registerWallet,
};
