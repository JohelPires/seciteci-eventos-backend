// lista = [1, 3, 5, 6, 8, 12, 23, 24, 57, 60, 74, 83]

// function search(list, value) {
//    let index = 0

//    if (list.length == 0) return -1

//    const middle = Math.floor(list.length / 2)

//    if (list[middle] == value) {
//       return middle
//    } else if (list[middle] > value) {
//       return search(list.slice(0, middle), value)
//    } else if (list[middle] < value) {
//       return search(list.slice(middle + 1), value)
//    } else {
//       return -1
//    }
// }

// console.log(search(lista, 6))

// stock_prices = [10, 7, 5, 8, 11, 9]

// function get_max_profit(list) {
//    let max = 0
//    list.map((v) => {
//       list.map((v2) => {
//          if (v2 - v > max) {
//             max = v2 - v
//          }
//       })
//    })
//    console.log(max)
// }

// get_max_profit(stock_prices)

// happy number

// n = 100

// function happy(n) {
//    result = String(n)
//       .split('')
//       .map((v) => parseInt(v))
//       .reduce((p, c) => Math.pow(p, 2) + Math.pow(c, 2))

//    if (result == 1) {
//       console.log(true)
//    } else {
//       if (result == n) {
//          console.log(false)
//          return
//       }
//       happy(result)
//    }
// }

// happy(n)

// VALID PARENTHESIS

// input = '()[()]'

// function isValid(i) {
//    if (i.length == 0) return true
//    if ([')', ']', '}'].includes(i[0])) {
//       return false
//    }
//    if (i[0] == '(') {
//       const closed = i.indexOf(')')
//       if (closed > 0) {
//          i = i.slice(0, closed) + i.slice(closed + 1)
//          i = i.slice(1)
//          return isValid(i)
//       } else {
//          return false
//       }
//    }
//    if (i[0] == '[') {
//       const closed = i.indexOf(']')
//       if (closed > 0) {
//          i = i.slice(0, closed) + i.slice(closed + 1)
//          i = i.slice(1)
//          return isValid(i)
//       } else {
//          return false
//       }
//    }
//    if (i[0] == '{') {
//       const closed = i.indexOf('}')
//       if (closed > 0) {
//          i = i.slice(0, closed) + i.slice(closed + 1)
//          i = i.slice(1)
//          return isValid(i)
//       } else {
//          return false
//       }
//    }
// }

// console.log(isValid(input))

// function isPalindrome(word) {

//    let leftidx = 0
//    let rightidx = word.length - 1

//    while (leftidx < rightidx) {
//       if (word[leftidx] != word[rightidx]) {
//          return false
//       } else {
//          leftidx++
//          rightidx--
//       }
//    }
//    return true
// }

// console.log(isPalindrome('teste'))

// Longest substring of non repeating characters:

// a b c a b c b b

// function longestSub(s) {
//    const map = {} // key is char, val is index

//    let start = 0
//    let maxLength = 0

//    for (let i = 0; i < s.length; i++) {
//       endChar = s[i]
//       if (map[endChar] >= start) {
//          start = map[endChar] + 1
//       }
//       map[endChar] = i

//       maxLength = Math.max(maxLength, i - start + 1)
//    }

//    return maxLength
// }
// // i = 4
// // endChar = 'b'
// // start = 1
// // {
// //    a: 3,
// //    b: 1,
// //    c: 2,
// // }
// // maxlenght = 3

// console.log(longestSub('abcabcbb'))

/*
 * FIXED SIZE SLIDING WINDOW
 * find the largest sum among all subarrays of length k
 *
 */

// const nums = [1, 2, 3, 7, 4, 1]
// const k = 3

// function largestSumArray(nums, k) {
//    let windowSum = 0

//    for (i = 0; i < k; i++) {
//       windowSum = windowSum + nums[i]
//    }

//    let largestSum = windowSum

//    console.log(largestSum)

//    for (let right = k; right < nums.length; right++) {
//       let left = right - k
//       windowSum = windowSum - nums[left]
//       windowSum = windowSum + nums[right]
//       largestSum = Math.max(largestSum, windowSum)
//    }

//    return largestSum
// }

// console.log(largestSumArray(nums, k))

// function reverseString(str) {
//    let newStr = ''
//    for (let i = str.length - 1; i >= 0; i--) {
//       newStr = newStr + str[i]
//    }
//    return newStr
// }

function reverseString(str) {
   return str.split('').reverse().join('')
}

let string = 'hello'

console.log(reverseString(string))

function reverseInt(num) {
   let negative = false
   if (num < 0) {
      negative = true
      num = -num
   }

   const numStr = parseInt(num.toString().split('').reverse().join(''))
   if (negative) {
      return -numStr
   } else {
      return numStr
   }
}

let num = -12345

console.log(reverseInt(num))
