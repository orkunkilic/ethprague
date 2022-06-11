const { getContractFactory } = require("@nomiclabs/hardhat-ethers/types");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Pool Contract", function (){
    let cOwner, hOwner1, hOwner2, inspector1, inspector2, inspector3, investor1, investor2;
    let DeedNFT;
    let StableCoin;
    let DeinsuranceToken;
    let Staking;
    let Pool;
    let PoolToken;

    beforeEach(async function (){
        [cOwner, hOwner1, hOwner2, inspector1, inspector2, inspector3, investor1, investor2] = await ethers.getSigners();

        DeedNFT = await (await ethers.getContractFactory("DeedNFT")).deploy("0xdD870fA1b7C4700F2BD7f44238821C26f7392148");
        await DeedNFT.deployed();

        StableCoin = await (await ethers.getContractFactory("ERC20Token")).deploy();
        await StableCoin.deployed();

        DeinsuranceToken = await (await ethers.getContractFactory("DeinsuranceToken")).deploy();
        await DeinsuranceToken.deployed();

        Staking = await (await ethers.getContractFactory("Staking")).deploy(DeinsuranceToken.address);
        await Staking.deployed();

        Pool = await (await ethers.getContractFactory("Pool")).deploy(DeedNFT.address, StableCoin.address, 10, 20, 10, 3, Staking.address);
        await Pool.deployed();

        let giveApprovalTx = await StableCoin.connect(hOwner1).approve(Pool.address, ethers.utils.parseEther("99999999999999"));
        await giveApprovalTx.wait();

        giveApprovalTx = await StableCoin.connect(hOwner2).approve(Pool.address, ethers.utils.parseEther("99999999999999"));
        await giveApprovalTx.wait();
        
        giveApprovalTx = await StableCoin.connect(investor1).approve(Pool.address, ethers.utils.parseEther("99999999999999"));
        await giveApprovalTx.wait();

        giveApprovalTx = await StableCoin.connect(investor2).approve(Pool.address, ethers.utils.parseEther("99999999999999"));
        await giveApprovalTx.wait();

    });

    describe("Workflow", function () {

        beforeEach(async function () {
            await (await StableCoin.mint(ethers.utils.parseEther("1000000000000000"))).wait();
            await (await StableCoin.transfer(hOwner1.address, ethers.utils.parseEther("1000000"))).wait();
            await (await StableCoin.transfer(hOwner2.address, ethers.utils.parseEther("1000000"))).wait();
            await (await StableCoin.transfer(inspector1.address, ethers.utils.parseEther("1000000"))).wait();
            await (await StableCoin.transfer(inspector2.address, ethers.utils.parseEther("1000000"))).wait();
            await (await StableCoin.transfer(inspector3.address, ethers.utils.parseEther("1000000"))).wait();
            await (await StableCoin.transfer(investor1.address, ethers.utils.parseEther("1000000"))).wait();
            await (await StableCoin.transfer(investor2.address, ethers.utils.parseEther("1000000"))).wait();

            const mintHouseTx = await DeedNFT.safeMint(hOwner1.address, 1, ethers.utils.parseEther("100000"), 13, 31, 1234, 5678);
            await mintHouseTx.wait();
            
            await (await Pool.addInspector(31, inspector1.address));
            await (await Pool.addInspector(31, inspector2.address));
            await (await Pool.addInspector(31, inspector3.address));

        });
        
        describe("pool enterance period", function (){
            it("should let home with right conditions enter pool", async function (){
                await expect(Pool.connect(hOwner1).enterPool(1)).not.to.be.reverted;
            });

            it("shouldn't let none homeowner enter pool", async function(){
                await expect(Pool.connect(hOwner2).enterPool(1)).to.be.reverted;
            });

            it("shouldn't let homes with inadequate risk levels enter the pool", async function (){
                await (await DeedNFT.safeMint(hOwner2.address, 2, ethers.utils.parseEther("100000"), 90, 42, 1234, 5678)).wait();
                
                await (await Pool.addInspector(42, inspector1.address));
                await (await Pool.addInspector(42, inspector2.address));
                await (await Pool.addInspector(42, inspector3.address));



                await expect(Pool.connect(hOwner2).enterPool(2)).to.be.reverted;
            });

            it("shouldn't let homes with inspectors less than 3 enter the pool", async function (){
                await (await DeedNFT.safeMint(hOwner2.address, 2, ethers.utils.parseEther("100000"), 90, 42, 1234, 5678)).wait();
                
                await (await Pool.addInspector(42, inspector1.address));

                await expect(Pool.connect(hOwner2).enterPool(2)).to.be.reverted;

            });

            it("shouldn't let claims be made before pool enterance period closes", async function (){
                await (await Pool.connect(hOwner1).enterPool(1)).wait();

                await expect(Pool.connect(hOwner1).makeClaimRequest(1)).to.be.reverted;

            });

            it("shouldn't let inspectors vote", async function (){
                await (await Pool.connect(hOwner1).enterPool(1)).wait();

                await expect(Pool.connect(inspector1).voteClaimRequest(1, true, 31)).to.be.reverted;
            });

            it("shouldn't let house owners claim 'reward'.", async function () {
                await (await Pool.connect(hOwner1).enterPool(1)).wait();

                await expect(Pool.connect(hOwner1).claimAsHouseOwner(1)).to.be.reverted;
            });

            it("shouldn't let investors buy pool tokens", async function (){
                await expect(Pool.connect(investor1).buyPoolPartially(10)).to.be.reverted;
            });

            it("shouldn't let investors claim", async function (){
                await expect(Pool.connect(investor1).claimAsInsurer()).to.be.reverted;
            });

            it("should let owner make contract go to next period for demo purposes.", async function(){
                await (await Pool.demoEndPoolEntrance()).wait();

                await expect(Pool.startTokenSale()).not.to.be.reverted;
            });

        });


        describe("pool entrance closed.", function (){
            beforeEach(async function (){
                await (await Pool.connect(hOwner1).enterPool(1)).wait();
                await (await Pool.demoEndPoolEntrance()).wait();
                await (await Pool.startTokenSale()).wait();

                await (await StableCoin.transfer(investor1.address, ethers.utils.parseEther("1000000000000"))).wait();
                await (await StableCoin.transfer(investor2.address, ethers.utils.parseEther("1000000000000"))).wait();

                PoolToken = await ethers.getContractAt("PoolToken", await Pool.getPoolTokenAddress());

            });

            describe("investors", function(){
                it("should let investors buy pool tokens", async function (){
                    await (await Pool.connect(investor1).buyPoolPartially(50)).wait();
                    await (await Pool.connect(investor2).buyPoolPartially(50)).wait();
                    var balance = await PoolToken.balanceOf(investor1.address);
                    var balance2 = await PoolToken.balanceOf(investor2.address);
                    await expect(balance).to.be.equal(50);
                    await expect(balance2).to.be.equal(50); // both balances for pool token be 50
                });

                it("investors can't claim yet", async function () {
                    await (await Pool.connect(investor1).buyPoolPartially(50)).wait()
                    await expect(Pool.claimAsInsurer()).to.be.reverted;
                });
            });

            describe("house owners", function () {
                it("can claim damages.", async function () {
                    await expect(Pool.connect(hOwner1).makeClaimRequest(1)).not.to.be.reverted;
                });
                
                
                it("can't double claim damages.", async function (){
                    await (await Pool.connect(hOwner1).makeClaimRequest(1)).wait();
                    await expect( Pool.connect(hOwner1).makeClaimRequest(1)).to.be.revertedWith("Already has claim request!");
                });
            });

            describe("inspectors", function (){
                beforeEach(async function (){
                    await (await Pool.connect(hOwner1).makeClaimRequest(1)).wait();
                });

                it("can vote for house", async function () {
                    await expect(Pool.connect(inspector1).voteClaimRequest(1, true)).not.be.reverted;
                    await expect(Pool.connect(inspector1).voteClaimRequest(1, false)).not.be.reverted;
                });

                it("can grant house if majority of inspectors vote ok", async function(){

                });

                it("can deny house if majorty of inspectors vote not ok", async function (){

                });

                it("shouldn't let vote for houses out of zipcode.", async function () {
    
                });
            });
        });


        describe("pool ends", function() {
            beforeEach(async function (){
                await (await Pool.connect(hOwner1).enterPool(1)).wait();
                await (await DeedNFT.safeMint(hOwner2.address, 2, ethers.utils.parseEther("200000"), 15, 31, 1234, 5678)).wait();
                await (await Pool.connect(hOwner2).enterPool(2)).wait();


                await (await Pool.demoEndPoolEntrance()).wait();
                await (await Pool.startTokenSale()).wait();

                await (await StableCoin.transfer(investor1.address, ethers.utils.parseEther("1000000000000"))).wait();
                await (await StableCoin.transfer(investor2.address, ethers.utils.parseEther("1000000000000"))).wait();

                PoolToken = await ethers.getContractAt("PoolToken", await Pool.getPoolTokenAddress());

                await (await Pool.connect(investor1).buyPoolPartially(50)).wait();
                await (await Pool.connect(investor2).buyPoolPartially(50)).wait();


                await (await Pool.connect(hOwner1).makeClaimRequest(1)).wait();
                await (await Pool.connect(hOwner2).makeClaimRequest(2)).wait();

                await (await Pool.connect(inspector1).voteClaimRequest(1, true)).wait();
                await (await Pool.connect(inspector2).voteClaimRequest(1, true)).wait();
                await (await Pool.connect(inspector3).voteClaimRequest(1, true)).wait();

                await (await Pool.connect(inspector1).voteClaimRequest(1, false)).wait();
                await (await Pool.connect(inspector2).voteClaimRequest(1, false)).wait();
                await (await Pool.connect(inspector3).voteClaimRequest(1, false)).wait();


            });
            describe("house owners claiming 'rewards'", function (){
                it("should let granted houses owners claim.", async function (){

                });
                it("shouldn't let denied house owners claim.", async function (){

                });
            });
    
            describe("investors claiming 'rewards'", function () {
                it("should let investor claim after houses all claimed", async function () {

                });
            });
        });
    });





});