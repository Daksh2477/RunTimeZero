/**
 * Deploy the three contracts and wire their roles.
 *
 * Order matters: the certificate contract must exist before CarbonCredit can
 * reference it, and CarbonCredit must be granted ISSUER_ROLE afterwards — it is
 * the only path to a retirement certificate, so nothing else should be able to
 * mint one.
 *
 *   npm run deploy:amoy --workspace=apps/contracts
 */

const { ethers } = require('hardhat');

async function main() {
  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();
  console.log(`deploying as ${deployer.address} on chain ${net.chainId}`);

  const cert = await (await ethers.getContractFactory('RetirementCertificate')).deploy();
  await cert.waitForDeployment();

  const ev = await (await ethers.getContractFactory('BatchEvidence')).deploy(deployer.address);
  await ev.waitForDeployment();

  const credit = await (await ethers.getContractFactory('CarbonCredit')).deploy(
    deployer.address,
    await ev.getAddress(),
    await cert.getAddress(),
  );
  await credit.waitForDeployment();

  await (await cert.grantRole(await cert.ISSUER_ROLE(), await credit.getAddress())).wait();

  const addresses = {
    chainId: Number(net.chainId),
    RetirementCertificate: await cert.getAddress(),
    BatchEvidence: await ev.getAddress(),
    CarbonCredit: await credit.getAddress(),
  };

  console.log(JSON.stringify(addresses, null, 2));
  require('fs').writeFileSync(
    require('path').join(__dirname, '..', 'addresses.json'),
    JSON.stringify(addresses, null, 2) + '\n',
  );
  console.log('\nwrote apps/contracts/addresses.json');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
