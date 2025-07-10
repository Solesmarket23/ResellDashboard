import { getOrderNumberForGmailSearch, generateGmailSearchUrl, isXpressOrderNumber, isStandardOrderNumber } from './orderNumberUtils';

// Test data from user's example
const testOrderNumbers = [
  { input: "73258261-73158020", expected: "73158020", type: "Standard order" },
  { input: "75252721", expected: "75252721", type: "Single number" },
  { input: "01-GNHWJCZS95", expected: "01-GNHWJCZS95", type: "Xpress order" },
  { input: "72999996-72899755", expected: "72899755", type: "Standard order" }
];

// Test the function (this would be used in actual tests)
export function testOrderNumberFormatting(): void {
  console.log('🧪 Testing Order Number Formatting Functions');
  console.log('='.repeat(60));

  testOrderNumbers.forEach(({ input, expected, type }) => {
    const result = getOrderNumberForGmailSearch(input);
    const isCorrect = result === expected;
    
    console.log(`📝 ${type}:`);
    console.log(`   Input:    ${input}`);
    console.log(`   Expected: ${expected}`);
    console.log(`   Result:   ${result}`);
    console.log(`   Status:   ${isCorrect ? '✅ PASS' : '❌ FAIL'}`);
    
    // Test URL generation
    const url = generateGmailSearchUrl(input);
    console.log(`   Gmail URL: ${url}`);
    
    // Test order type detection
    const isXpress = isXpressOrderNumber(input);
    const isStandard = isStandardOrderNumber(input);
    console.log(`   Type Detection: Xpress=${isXpress}, Standard=${isStandard}`);
    console.log('');
  });

  // Additional edge cases
  const edgeCases = [
    { input: "", expected: "", type: "Empty string" },
    { input: "ABC123", expected: "ABC123", type: "No hyphen" },
    { input: "123-", expected: "123-", type: "Hyphen at end" },
    { input: "-456", expected: "-456", type: "Hyphen at start" },
    { input: "123-456-789", expected: "123-456-789", type: "Multiple hyphens" }
  ];

  console.log('🔬 Testing Edge Cases');
  console.log('='.repeat(60));

  edgeCases.forEach(({ input, expected, type }) => {
    const result = getOrderNumberForGmailSearch(input);
    
    console.log(`📝 ${type}:`);
    console.log(`   Input:    "${input}"`);
    console.log(`   Result:   "${result}"`);
    console.log('');
  });
}

// Auto-run tests when this module is imported (for debugging)
if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
  // Only run tests in development
  testOrderNumberFormatting();
} 