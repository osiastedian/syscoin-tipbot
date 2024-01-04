var LocalStorage = require("node-localstorage").LocalStorage;
localStorage = new LocalStorage("../../ls");
const Log = require("../../log");
var nonceMap = require("../../ls");

const get = (prefix, address) => {
  const key = `${prefix}_nonce_${address}`;
  if (!nonceMap.get(key)) {
    return null;
  }
  const parseNonce = parseInt(nonceMap.get(key), 10);
  return parseNonce;
};

const set = (prefix, address, value) => {
  const key = `${prefix}_nonce_${address}`;
  nonceMap.set(key, value);
};

const getLatestNonce = async (address, jsonRpc, prefix = "") => {
  let nonce = get(prefix, address);
  const pendingNonce = parseInt(
    await jsonRpc.getTransactionCount(address, "pending"),
    10
  );
  Log.debug({ savedNonce: nonce, pendingNonce });
  if (!nonce || nonce < pendingNonce) {
    nonce = pendingNonce;
  } else if (nonce - pendingNonce > 1) {
    nonce = pendingNonce;
  }
  Log.debug({ finalNonce: nonce });
  set(prefix, address, nonce + 1);
  return nonce;
};

module.exports = {
  getLatestNonce,
};
