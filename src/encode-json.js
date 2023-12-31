const toFixedNumbers = (key, val) => {
  if (typeof val === 'number') {
    return parseFloat(val.toFixed(2))
  } else {
    return val
  }
}

const encodeJSON = (object) => JSON.stringify(object, toFixedNumbers)

module.exports = { encodeJSON }
