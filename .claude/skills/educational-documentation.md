# Educational Code Documentation Standards

> Use this skill when writing code for learning purposes or when the user is learning to code.

---

## Purpose

All code should be **educational and accessible** to someone learning to code. The goal is to help understand not just *what* the code does, but *why* it works and *how* to think about programming concepts.

---

## 1. Line-by-Line Comments

**MANDATORY**: Every line of code must include an inline comment explaining what it does in plain English.

### Guidelines
- Explain the **purpose** and **reasoning**, not just restate the code
- Use simple, jargon-free language when possible
- When using technical terms, briefly explain them
- Connect the line to the bigger picture when helpful

### Examples

```javascript
// Good - explains purpose and teaches
const userAge = parseInt(userInput); // Convert the text input to a number so we can do math with it

// Good - explains the "why" behind the choice
if (userAge < 0) { // Check for invalid ages - ages can't be negative
  return null; // Return null to signal "no valid result" to the calling code
}

// Good - explains a programming concept
const users = []; // Create an empty array - arrays are lists that can hold multiple items

// Bad - just restates the code without teaching
const x = 5; // set x to 5
```

### Language-Specific Comment Syntax
| Language | Syntax |
|----------|--------|
| JavaScript/TypeScript | `// comment` or `/* multi-line */` |
| Python | `# comment` |
| HTML | `<!-- comment -->` |
| CSS | `/* comment */` |
| Bash/Shell | `# comment` |

---

## 2. File-Level Documentation

Every file should begin with a documentation block explaining:

1. **What this file is for** - its role in the project
2. **How it fits into the bigger picture** - what other files depend on it or it depends on
3. **Key concepts used** - any programming patterns or techniques a beginner should know about

### JavaScript/TypeScript Example

```javascript
/**
 * FILE: userAuthentication.js
 *
 * PURPOSE:
 * This file handles user login and logout. It checks if a username and password
 * are correct, and keeps track of whether someone is currently logged in.
 *
 * HOW IT FITS IN:
 * - Used by: app.js (the main application calls these functions when users try to log in)
 * - Depends on: database.js (we need to look up user info from the database)
 *
 * KEY CONCEPTS:
 * - Async/await: Some operations (like checking the database) take time. We use
 *   "async/await" to wait for them to finish without freezing the whole program.
 * - Hashing: We never store actual passwords. Instead, we store a "hash" (scrambled
 *   version) and compare hashes. This keeps passwords safe even if data is stolen.
 */
```

### Python Example

```python
"""
FILE: data_processor.py

PURPOSE:
This file takes raw data from CSV files and cleans it up for analysis.
"Cleaning" means fixing missing values, removing duplicates, and making
sure all the data is in a consistent format.

HOW IT FITS IN:
- Used by: main.py runs this after downloading new data
- Depends on: pandas library (a popular tool for working with data tables)

KEY CONCEPTS:
- DataFrames: Think of these as spreadsheets in Python. Each column has a name,
  and each row is one record of data.
- NaN values: "Not a Number" - this is how pandas marks missing or invalid data.
  We need to handle these or our calculations will break.
"""
```

---

## 3. Function-Level Documentation

Every function should have documentation explaining:

1. **What the function does** - in plain English
2. **Parameters** - what inputs it needs and what they mean
3. **Return value** - what it gives back
4. **How it works** - a brief explanation of the algorithm/approach
5. **Example usage** - when helpful for understanding

### JavaScript Example

```javascript
/**
 * Calculates the average of a list of numbers.
 *
 * WHAT IT DOES:
 * Takes a list of numbers and finds their average (also called the "mean").
 * The average is calculated by adding all numbers together, then dividing
 * by how many numbers there are.
 *
 * PARAMETERS:
 * @param {number[]} numbers - An array of numbers to average.
 *   Example: [10, 20, 30] or [85, 92, 78, 90]
 *
 * RETURNS:
 * @returns {number} The average value, or 0 if the list is empty.
 *   Example: [10, 20, 30] returns 20
 *
 * HOW IT WORKS:
 * 1. First, we check if the list is empty (to avoid dividing by zero)
 * 2. We add up all the numbers using reduce() - a function that combines array items
 * 3. We divide the total by the count of numbers
 *
 * EXAMPLE:
 * const grades = [85, 92, 78, 90];
 * const averageGrade = calculateAverage(grades); // Returns 86.25
 */
function calculateAverage(numbers) {
  if (numbers.length === 0) { // Guard clause: handle empty arrays to prevent divide-by-zero
    return 0; // Return 0 as a sensible default for "no numbers to average"
  }

  const sum = numbers.reduce((total, num) => total + num, 0); // Add all numbers together; reduce() loops through and accumulates a total
  const average = sum / numbers.length; // Divide total by count to get the average

  return average; // Send the result back to whoever called this function
}
```

### Python Example

```python
def find_longest_word(sentence):
    """
    Finds the longest word in a sentence.

    WHAT IT DOES:
    Takes a sentence and returns the longest word in it. If there's a tie,
    it returns the first longest word found.

    PARAMETERS:
    sentence (str): A string containing words separated by spaces.
        Example: "The quick brown fox"

    RETURNS:
    str: The longest word found, or empty string if sentence is empty.
        Example: "The quick brown fox" returns "quick"

    HOW IT WORKS:
    1. Split the sentence into individual words
    2. Look at each word and keep track of the longest one we've seen
    3. Return the longest word at the end

    EXAMPLE:
    >>> find_longest_word("I love programming")
    'programming'
    """
    if not sentence:  # Check if sentence is empty or None - return early if so
        return ""  # Return empty string as there are no words to find

    words = sentence.split()  # Split sentence into list of words; split() breaks on spaces
    longest = ""  # Start with empty string; we'll update this as we find longer words

    for word in words:  # Loop through each word in our list one at a time
        if len(word) > len(longest):  # Compare current word's length to our longest so far
            longest = word  # Found a longer word! Update our tracker

    return longest  # Return the longest word we found
```

---

## 4. Explaining Programming Concepts

When using programming patterns or concepts that a beginner might not know, add a brief explanation:

```javascript
// Using a callback function - a callback is a function we pass to another function,
// to be called later when something happens (like when data finishes loading)
fetchData(url, function(result) {
  console.log(result); // This runs AFTER the data loads, not immediately
});

// Using array destructuring - a shortcut to extract values from arrays into variables
const [first, second] = myArray; // first gets myArray[0], second gets myArray[1]

// Using the spread operator (...) - copies all items from one array into another
const combined = [...array1, ...array2]; // Creates new array with all items from both
```

---

## 5. Error Handling Explanations

Always explain error handling and why it's necessary:

```javascript
try { // "try" block: attempt to run this code, but be ready for it to fail
  const data = JSON.parse(userInput); // Try to convert text to a JavaScript object
} catch (error) { // "catch" block: if anything in "try" fails, this code runs instead
  console.log("Invalid JSON format"); // Tell the user what went wrong in plain language
  // We catch this error because user input might not be valid JSON,
  // and without catching it, the whole program would crash
}
```

---

## Summary

The goal is to make every piece of code a **learning opportunity**. Someone reading the code should:

1. Understand what each line does without needing to look it up
2. Learn *why* certain approaches are used
3. See how individual pieces fit into the larger program
4. Gain familiarity with common programming patterns and terminology

**Remember**: Write code as if you're teaching a friend who is excited to learn programming but hasn't done much of it yet.
