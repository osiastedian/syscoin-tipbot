const ethers = require("ethers");
const Log = require("../../log");
const { getLatestNonce } = require("./nonce");

const transactionQueue = [];
let isProcessingTransaction = false;

const SECOND = 1000;

setInterval(() => {
  if (isProcessingTransaction || transactionQueue.length === 0) {
    return;
  }
  isProcessingTransaction = true;
  const {
    privateKey,
    transactionConfig,
    jsonRpc,
    onFinish,
    onReject,
    network,
  } = transactionQueue.pop();

  sendTransaction(privateKey, transactionConfig, jsonRpc, network)
    .then((...args) => {
      isProcessingTransaction = false;
      onFinish(...args);
    })
    .catch((...args) => {
      isProcessingTransaction = false;
      onReject(...args);
    });
}, 1 * SECOND);

/**
 * Sends transaction to queue
 * @param {string} privateKey
 * @param {ethers.ethers.PopulatedTransaction} transactionConfig
 * @param {ethers.ethers.providers.JsonRpcProvider} jsonRpc
 * @param {string} network
 */
const runTransaction = (
  privateKey,
  transactionConfig,
  jsonRpc,
  network = "nevm"
) => {
  return new Promise((resolve, reject) => {
    transactionQueue.push({
      privateKey,
      transactionConfig,
      jsonRpc,
      onFinish: resolve,
      onReject: reject,
      network,
    });
  });
};

/**
 * Send transaction to Blockchain
 * @param {string} privateKey
 * @param {ethers.ethers.PopulatedTransaction} transactionConfig
 * @param {ethers.ethers.providers.JsonRpcProvider} jsonRpc
 */
const sendTransaction = async (
  privateKey,
  transactionConfig,
  jsonRpc,
  networkPrefix = ""
) => {
  const wallet = new ethers.Wallet(privateKey, jsonRpc);
  const nonce = await getLatestNonce(wallet.address, jsonRpc, networkPrefix);
  const configWithNonce = {
    ...transactionConfig,
    nonce,
  };
  Log.debug("Processing transaction", configWithNonce);
  const signedTransaction = await wallet.signTransaction(configWithNonce);
  return jsonRpc.sendTransaction(signedTransaction);
};

module.exports = { runTransaction };
