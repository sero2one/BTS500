'use strict'
// process.env.SILENT='true';

// Root object
const node = {}

const networkName = 'testnet'

const network = require(`config/${networkName}/network.json`)
node.config = require(`config/${networkName}/server.json`)
node.genesisBlock = require(`config/${networkName}/genesisBlock.json`)
node.delegates = require(`test/support/fixtures/${networkName}/delegatesPassphrases.json`)
node.gAccount = require(`test/support/fixtures/${networkName}/genesisPassphrase.json`)
node.gAccount.password = node.gAccount.passphrase

node.ark = require('arkjs')
node.ark.crypto.setNetworkVersion(network.pubKeyHash)

// Requires
// node.bignum = require('../helpers/bignum.js'); // TODO
node.constants = require('test/support/helpers/constants.js');
node.txTypes = require('test/support/helpers/transactionTypes.js');


node._ = require('lodash');
node.async = require('async');
node.popsicle = require('popsicle');

// TODO move to setup
node.chai = require('chai')
node.chai.config.includeStack = true
// node.chai.use(require('chai-bignumber')(node.bignum)) // TODO
node.expect = require('chai').expect

node.supertest = require('supertest')
require('colors')

// Node configuration
//node.baseUrl = 'http://' + node.config.address + ':' + node.config.port;
const baseUrl = port => `http://localhost:${port}`
node.baseUrl = baseUrl(node.config.port)

node.api = node.supertest(node.baseUrl)

node.normalizer = Math.pow(10, 8); // Use this to convert ARK amount to normal value
node.blockTime = 10000; // Block time in miliseconds
node.blockTimePlus = node.blockTime + 2000
node.version = '0.0.0'; // Node version

// Transaction fees
node.fees = {
  voteFee: node.constants.fees.vote,
  transactionFee: node.constants.fees.send,
  secondPasswordFee: node.constants.fees.secondsignature,
  delegateRegistrationFee: node.constants.fees.delegate,
  multisignatureRegistrationFee: node.constants.fees.multisignature
};


// Existing delegate account
node.eAccount = node.delegates[0];
node.eAccount.password = node.eAccount.passphrase;

// Optional logging
if (process.env.SILENT === 'true') {
  node.debug = function () {};
} else {
  node.debug = console.log;
}

let p2p
let publicApi
node.startRelay = options => {
  if (! options) {
    options = {
      server: require(`config/${networkName}/server.json`),
      genesisBlock: require(`config/${networkName}/genesisBlock.json`),
      network: require(`config/${networkName}/network.json`)
    }
  }

  const config = require('core/config')
  config.init(options)

  const logger = require('core/logger')
  logger.init(config.server.fileLogLevel, `TEST-${config.network.name}-relay`)

  // Useful for avoiding useless logs
  logger.level('error')
  // logger.mute()

  // process.on('unhandledRejection', (reason, p) => {
  //   logger.error('Unhandled Rejection at: Promise', p, 'reason:', reason)
  // })

  const BlockchainManager = require('core/blockchainManager')
  const P2PInterface = require('api/p2p/p2pinterface')

  const blockchainManager = new BlockchainManager(config)
  p2p = new P2PInterface(config)

  const DB = require('core/dbinterface')
  const PublicAPI = require('api/public/api')

  return DB
    .create(config.server.db)
    .then(db => {
      logger.info('\t> Database started'.cyan)
      blockchainManager.attachDBInterface(db)
      return blockchainManager.attachNetworkInterface(p2p).init()
    })
    .then(lastBlock => {
      logger.info('\t> Blockchain initialized, local lastBlock'.cyan, (lastBlock.data || {height: 0}).height)
    })
    .then(() => p2p.warmup())
    .then(() => {
      logger.info('\t> Network interface started'.cyan)
    })
    .then(() => blockchainManager.syncWithNetwork())
    .then(() => {
      logger.info('\t> Blockchain synced'.cyan)
    })
    .then(() => {
      publicApi = new PublicAPI(config)
      publicApi.start()
    })
    .then(() => {
      logger.info('\t> Public API ready'.cyan)
      Promise.resolve('hell yeah!')
    })
    .catch(fatal => logger.error('FATAL ERROR'.red, fatal))
}

node.stopRelay = () => {
  return new Promise((resolve, reject) => {
    if (publicApi) {
      publicApi.server.close(() => {
        if (p2p) {
          p2p.up.server.close(() => {
            console.log('BYE');
            resolve()
          })
        } else {
          reject()
        }
      })
    } else {
      reject()
    }
  })
}

node.resumeRelay = options => {
  return new Promise((resolve, reject) => {
    if (!p2p) {
      node.startRelay(options).then(() => {
        resolve()
      })
    } else {
      resolve(p2p)
    }
  })
}

node.startForger = options => {
  if (! options) {
    options = {
      server: require(`config/${networkName}/server.json`),
      genesisBlock: require(`config/${networkName}/genesisBlock.json`),
      network: require(`config/${networkName}/network.json`),
      delegates: require(`config/${networkName}/delegate.json`)
    }
  }

  const config = require('core/config')
  config.init(options)

  const logger = require('core/logger')
  logger.init(config.server.fileLogLevel, `TEST-${config.network.name}-forger`)

  process.on('unhandledRejection', (reason, p) => {
    logger.error('Unhandled Rejection at: Promise', p, 'reason:', reason)
  })

  const ForgerManager = require('core/forgerManager')
  const forgerManager = new ForgerManager(config)

  return forgerManager
    .loadDelegates()
    .then(forgers => logger.info('ForgerManager started with', forgers.length, 'forgers'))
    .then(() => forgerManager.startForging('http://127.0.0.1:4000'))
    .catch(fatal => logger.error('fatal error', fatal))
}

// Random ARK amount
node.Ark = Math.floor(Math.random() * (100000 * Math.pow(10, 8))) + 1;

// Returns a random delegate name
node.randomDelegateName = function () {
  var size = node.randomNumber(1, 20); // Min. delegate name size is 1, Max. delegate name is 20
  var delegateName = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@$&_.';

  for (var i = 0; i < size; i++) {
    delegateName += possible.charAt(Math.floor(Math.random() * possible.length));
  }

  return delegateName;
};

// Returns a random property from the given object
node.randomProperty = function (obj, needKey) {
  var keys = Object.keys(obj);

  if (!needKey) {
    return obj[keys[keys.length * Math.random() << 0]];
  } else {
    return keys[keys.length * Math.random() << 0];
  }
};

// Returns random ARK amount
node.randomArk = function () {
  return Math.floor(Math.random() * (100 * 100000000)) + (10 * 100000000);
};

// Returns current block height
node.getHeight = function (cb) {
  var request = node.popsicle.get(`${node.baseUrl}/api/blocks/getHeight`)

  request.use(node.popsicle.plugins.parse(['json']));

  request.then(function (res) {
    if (res.status !== 200) {
      return setImmediate(cb, ['Received bad response code', res.status, res.url].join(' '));
    } else {
      return setImmediate(cb, null, res.body.height);
    }
  });

  request.catch(function (err) {
    return setImmediate(cb, err);
  });
};

// Upon detecting a new block, do something
node.onNewBlock = function (cb) {
  node.getHeight(function (err, height) {
    if (err) {
      return cb(err);
    } else {
      node.waitForNewBlock(height, cb);
    }
  });
};

// Waits for a new block to be created
node.waitForNewBlock = function (height, cb) {
  var actualHeight = height;
  var counter = 1;

  node.async.doWhilst(
    function (cb) {
      var request = node.popsicle.get(`${node.baseUrl}/api/blocks/getHeight`);

      request.use(node.popsicle.plugins.parse(['json']));

      request.then(function (res) {
        if (res.status !== 200) {
          return cb(['Received bad response code', res.status, res.url].join(' '));
        }

        if (height + 1 === res.body.height) {
          height = res.body.height;
        }

        node.debug('	Waiting for block:'.grey, 'Height:'.grey, res.body.height, 'Second:'.grey, counter++);
        setTimeout(cb, 1000);
      });

      request.catch(function (err) {
        return cb(err);
      });
    },
    function () {
      return actualHeight === height;
    },
    function (err) {
      if (err) {
        return setImmediate(cb, err);
      } else {
        return setImmediate(cb, null, height);
      }
    }
  );
};

// Adds peers to local node TODO use Promise instead of callback
node.addPeers = function (numOfPeers, cb) {
  const operatingSystems = ['win32','win64','ubuntu','debian', 'centos']
  // const ports = [4000, 5000, 7000, 8000]
  const ports = [4003]

  var os, version, port;
  var i = 0;

  node.async.whilst(function () {
    return i < numOfPeers;
  }, function (next) {
    os = operatingSystems[node.randomizeSelection(operatingSystems.length)];
    version = node.config.version;
    port = ports[node.randomizeSelection(ports.length)];

    var request = node.popsicle.get({
      url: `${baseUrl(port)}/peer/height`,
      headers: {
        version,
        port,
        nethash: node.config.nethash,
        os
      }
    });

    // request.use(node.popsicle.plugins.parse(['json']));

    request.then(function (res) {
      console.log('RES', res);
      if (res.status !== 200) {
        return next(['Received bad response code', res.status, res.url].join(' '));
      } else {
        i++;
        next();
      }
    });

    request.catch(function (err) {
      console.log('RES ERR');
      return next(err);
    });
  }, function (err) {
    return cb(err, {os, version, port});
  });
};

// Returns a random index for an array
node.randomizeSelection = function (length) {
  return Math.floor(Math.random() * length);
};

// Returns a random number between min (inclusive) and max (exclusive)
node.randomNumber = function (min, max) {
  return	Math.floor(Math.random() * (max - min) + min);
};

// Returns the expected fee for the given amount
node.expectedFee = function (amount) {
  return parseInt(node.fees.transactionFee);
};

// Returns a random username
node.randomUsername = function () {
  var size = node.randomNumber(1, 16); // Min. username size is 1, Max. username size is 16
  var username = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@$&_.';

  for (var i = 0; i < size; i++) {
    username += possible.charAt(Math.floor(Math.random() * possible.length));
  }

  return username;
};

// Returns a random capitialized username
node.randomCapitalUsername = function () {
  var size = node.randomNumber(1, 16); // Min. username size is 1, Max. username size is 16
  var username = 'A';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@$&_.';

  for (var i = 0; i < size - 1; i++) {
    username += possible.charAt(Math.floor(Math.random() * possible.length));
  }

  return username;
};

// Returns a random application name
node.randomApplicationName = function () {
  var size = node.randomNumber(1, 32); // Min. username size is 1, Max. username size is 32
  var name = 'A';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (var i = 0; i < size - 1; i++) {
    name += possible.charAt(Math.floor(Math.random() * possible.length));
  }

  return name;
};

// Returns a basic random account
node.randomAccount = function () {
  var account = {
    balance: '0'
  };

  account.password = node.randomPassword();
  account.secondPassword = node.randomPassword();
  account.username = node.randomDelegateName();
  account.publicKey = node.ark.crypto.getKeys(account.password, network).publicKey;
  account.address = node.ark.crypto.getAddress(account.publicKey, network.pubKeyHash);

  return account;
};

// Returns an extended random account
node.randomTxAccount = function () {
  return node._.defaults(node.randomAccount(), {
    sentAmount:'',
    paidFee: '',
    totalPaidFee: '',
    transactions: []
  });
};

// Returns a random password
node.randomPassword = function () {
  return Math.random().toString(36).substring(7);
};

// Abstract request
const abstractRequest = options => {
  node.debug(`${'> Path:'.grey} ${options.verb} ${options.path}`)

  const request = node.api[options.verb.toLowerCase()](options.path)
  request.set('Accept', 'application/json')

  const serverConfig = require(`config/${networkName}/server.json`)
  request.set('version', serverConfig.version)
  request.set('port', serverConfig.port)
  const networkConfig = require(`config/${networkName}/network.json`)
  request.set('nethash', networkConfig.nethash)

  if (options.params) {
    request.send(options.params)
    // node.debug('> Data:'.grey, JSON.stringify(options.params))
  }

  request.expect('Content-Type', /json/)
  request.expect(200)

  request.then(res => {
    // node.debug('> Response:'.grey, JSON.stringify(res.body))
  })
  request.catch(err => {
    if (err.message.match(/ECONNREFUSED/)) {
      node.debug('> ERROR:'.red, err.message)
      node.debug('> nethash:'.grey, networkConfig.nethash)
    } else {
      node.debug('> ERROR:'.red, err)
    }
    // Promise.reject(err)
  })

  return request
}

// Get the given path
node.get = function (path, params=null) {
  return abstractRequest({ verb: 'GET', path, params })
}

// Post to the given path
node.post = function (path, params, done) {
  return abstractRequest({ verb: 'POST', path, params }, done)
}

// Put to the given path
node.put = function (path, params, done) {
  return abstractRequest({ verb: 'PUT', path, params }, done)
}

before(() => {
  return node.resumeRelay()
})
after(() => {
  return node.stopRelay()
})

// Exports
module.exports = node
