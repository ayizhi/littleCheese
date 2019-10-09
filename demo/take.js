var Cheese = require('../Cheese');
var _ = require('lodash')

var { take, takeUntil, takeWhile, split } = require('../Cheese').Utils;

var ch  = new Cheese();
var ch1 = new Cheese();
var ch2 = new Cheese();


ch
.fromArray(_.range(100))
.then(take(10))
.each((v) => {
    console.log("Ch:  ", v.toString())
})

ch1
.fromArray(_.range(100))
.then(takeWhile(v => +v < 11))
.each(v => {
    console.log("Ch1: ", v.toString())
})

ch2
.fromArray(_.range(100))
.then(takeUntil(v => +v > 10))
.each(v => {
    console.log("Ch2: ", v.toString())
})


