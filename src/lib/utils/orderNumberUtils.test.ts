import { getOrderNumberForGmailSearch, generateGmailSearchUrl, isXpressOrderNumber, isStandardOrderNumber, formatOrderNumberForDisplay } from './orderNumberUtils';

// Test data from user's example
const testOrderNumbers = [
  { input: "73258261-73158020", expectedSearch: "73158020", expectedDisplay: "73158020", type: "Standard order" },
  { input: "75252721", expectedSearch: "75252721", expectedDisplay: "75252721", type: "Single number" },
  { input: "01-GNHWJCZS95", expectedSearch: "01-GNHWJCZS95", expectedDisplay: "01-GNHWJCZS95", type: "Xpress order" },
  { input: "72999996-72899755", expectedSearch: "72899755", expectedDisplay: "72899755", type: "Standard order" }
];

// Test the function (this would be used in actual tests)
export function testOrderNumberFormatting(): void {
  console.log('🧪 Testing Order Number Formatting Functions');
  console.log('='.repeat(60));

  testOrderNumbers.forEach(({ input, expectedSearch, expectedDisplay, type }) => {
    const searchResult = getOrderNumberForGmailSearch(input);
    const displayResult = formatOrderNumberForDisplay(input);
    const searchCorrect = searchResult === expectedSearch;
    const displayCorrect = displayResult === expectedDisplay;
    
    console.log(`📝 ${type}:`);
    console.log(`   Input:           ${input}`);
    console.log(`   Search Expected: ${expectedSearch}`);
    console.log(`   Search Result:   ${searchResult} ${searchCorrect ? '✅' : '❌'}`);
    console.log(`   Display Expected: ${expectedDisplay}`);
    console.log(`   Display Result:   ${displayResult} ${displayCorrect ? '✅' : '❌'}`);
    console.log(`   Overall Status:   ${searchCorrect && displayCorrect ? '✅ PASS' : '❌ FAIL'}`);
    
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
    const searchResult = getOrderNumberForGmailSearch(input);
    const displayResult = formatOrderNumberForDisplay(input);
    
    console.log(`📝 ${type}:`);
    console.log(`   Input:           "${input}"`);
    console.log(`   Search Result:   "${searchResult}"`);
    console.log(`   Display Result:  "${displayResult}"`);
    console.log('');
  });
}

// Auto-run tests when this module is imported (for debugging)
if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
  // Only run tests in development
  testOrderNumberFormatting();
} 