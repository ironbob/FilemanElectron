'use strict'
// Loader:node-gyp 构建产物在 ./build/Release/iosafc.node。
// 若未构建,require 会抛错,由上层(iOSAdapter)捕获并给出"需先构建"的提示。
module.exports = require('./build/Release/iosafc.node')
