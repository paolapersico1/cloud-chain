#!/usr/bin/env node

/* jshint esversion: 6 */
/* jshint node: true */
"use strict";
const https = require('https');
const express = require("express");
const session = require("express-session");
const busboy = require("connect-busboy");
const dotenv = require('dotenv');
const base32 = require("thirty-two");

const fs = require("fs");
const path = require("path");
const FileReader = require('filereader')

const Web3 = require('Web3');
const { auth, requiresAuth } = require('express-openid-connect');
const crypto = require('crypto');
const PrivateKeyProvider = require("truffle-hdwallet-provider");
const TruffleContract = require('@truffle/contract');
const truffleConfig = require(path.join(__dirname, "truffle-config.js"));
const FileDigestOracleArtifact = require(path.join(__dirname, "build", "contracts", "FileDigestOracle.json"));

function relative(...paths) {
	return paths.reduce((a, b) => path.join(a, b), process.cwd());
}

const agent = new https.Agent({
  rejectUnauthorized: false
})

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
//https.globalAgent.options.ca = require('ssl-root-cas').create();

const srcdir =  path.join(__dirname, "public");

dotenv.config();

let app = express();
let port = process.env.PORT || 3001;
app.listen(port);

app.use(session({
	secret: process.env.SESSION_KEY || "meowmeow",
	resave: false,
	saveUninitialized: false
}));
app.use(busboy());
app.use(express.urlencoded({ extended: true }))

//Initialize CloudSLA interaction 
const provider = truffleConfig.networks.quickstartWallet.provider();
const account = provider.getAddress(); // 0xf17f52151EbEF6C7334FAD080c5704D77216b732
console.log("Oracle address: " + account);

var truffleContract = TruffleContract(FileDigestOracleArtifact);
truffleContract.setProvider(provider);
var oracleTruffleContractInstance;
truffleContract.deployed().then(function(instance) {
  oracleTruffleContractInstance = instance;

  //event listening in truffle only works with events fired by own account
	//so we have to use web3
	var web3 = new Web3(provider);
	const oracleWeb3ContractInstance = new web3.eth.Contract(
	    FileDigestOracleArtifact.abi,
	    oracleTruffleContractInstance.address,
	);

	oracleWeb3ContractInstance.events.DigestRequested({})
    .on('data', async function(event){
        console.log("--Digest Request Received--");
        let url = event.returnValues.url;

        fetch(url, {method: 'GET', agent: agent})
				.then(function(res) {
			    return res.buffer()
			  })
			  .then((buffer)=>{
			    let shasum = crypto.createHash('sha256');
			    shasum.update(buffer);
			    let hash = "0x" + shasum.digest('hex');

			    oracleTruffleContractInstance.DigestStore(url, hash, {from: account})
	        .then(function(txReceipt) {
	        	console.log("--Digest Stored--");
			      console.log(txReceipt);
			    }).catch(function(err) {
					  console.log(err.message);
					});
				})
				.catch(function(err) {
					  console.log(err.message);
				});
    })
	  .on('error', console.error);

	}).catch(function(err) {
	  console.log(err.message);
});

app.all("/*", (req, res, next) => {
	res.filename = req.params[0];

	let fileExists = new Promise((resolve, reject) => {
		// check if file exists
		fs.stat(relative(res.filename), (err, stats) => {
			if (err) {
				return reject(err);
			}
			return resolve(stats);
		});
	});

	fileExists.then((stats) => {
		res.stats = stats;
		next();
	}).catch((err) => {
		res.stats = { error: err };
		next();
	});
});

app.get("/build/contracts/*", readFile);

function readFile(req, res){
	res.setHeader('Access-Control-Allow-Origin', '*');
  //res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE'); // If needed
  //res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type'); // If needed
  //res.setHeader('Access-Control-Allow-Credentials', true); // If needed

	if (res.stats.error) {
		console.log(res.stats.error);
	}
	else if (res.stats.isFile()) {
		res.sendFile(relative(res.filename), (err) => {
    	if (err) console.log(err);
  	});
	}
}

/*app.get("/hash/*", (req, res) => {
	res.filename = req.params[0];
	let file = null;

	fetch('https://cloudchain.com/' + res.filename.replace("hash/", ""), {method: 'GET', agent: agent})
	.then(function(res) {
    return res.buffer()
  })
  .then((buffer)=>{
    let shasum = crypto.createHash('sha256');
    shasum.update(buffer);
    res.send("0x" + shasum.digest('hex'));
  })
	.catch(err => {console.log(err);})
})*/

