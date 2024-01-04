const config = require("../../config.json");
const { ethers } = require("ethers");
const { getDistributorContract } = require("./contract");
/**
 *
 * @param {string[]} addressList
 * @param {ethers.ethers.BigNumber} amountPerReceiver
 * @param {ethers.ethers.BigNumber} value To be sent to contract
 * @param {ethers.ethers.providers.JsonRpcProvider} jsonProvider
 */
const generateDistributeFundsTransaction = async (
  addressList,
  amountPerReceiver,
  value,
  networkConfig,
  jsonRpc
) => {
  const defaultGasLimit =
    networkConfig.distributor.gasLimit +
    addressList.length * networkConfig.distributor.additionalGasPerAddress;
  const defaultMaxFeePerGas = ethers.utils.parseUnits(
    networkConfig.distributor.missions.maxFeePerGasInGwei,
    "gwei"
  );
  const defaultMaxPriorityFeePerGas = ethers.utils.parseUnits(
    networkConfig.distributor.missions.maxPriorityFeePerGasInGwei,
    "gwei"
  );

  const distributorContract = getDistributorContract(
    networkConfig.distributor.address,
    jsonRpc
  );

  const distributeTransactionConfig =
    await distributorContract.populateTransaction.distribute(
      amountPerReceiver,
      addressList,
      { value }
    );

  const { maxFeePerGas, maxPriorityFeePerGas } = await jsonRpc.getFeeData();
  const gasLimit = await distributorContract.estimateGas.distribute(
    amountPerReceiver,
    addressList,
    { value }
  );

  return {
    type: 2,
    chainId: networkConfig.chainId,
    ...distributeTransactionConfig,
    maxFeePerGas: maxFeePerGas ?? defaultMaxFeePerGas,
    maxPriorityFeePerGas: maxPriorityFeePerGas ?? defaultMaxPriorityFeePerGas,
    gasLimit: gasLimit ?? defaultGasLimit,
  };
};

module.exports = {
  generateDistributeFundsTransaction,
};
