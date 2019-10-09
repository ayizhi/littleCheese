var Cheese = require('../Cheese');

var { flatMap, split } = require('../Cheese').Utils;

var ch = new Cheese();

var words = ['test', 'goodbye'];

ch
.fromArray(words)
.then(split())
.then(flatMap(arr => arr))
.onError(err => console.error(err))
.each(cnt => {
    console.log('Ch: ', cnt.toString())
})