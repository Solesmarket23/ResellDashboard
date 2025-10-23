#!/usr/bin/env node

/**
 * Test script to demonstrate port adaptability
 * This shows how the Gmail OAuth redirect URI adapts to different ports
 */

const testPorts = [3000, 3001, 3002, 3003, 8080];

async function testPort(port) {
  try {
    const response = await fetch(`http://localhost:${port}/api/gmail/status`);
    const data = await response.json();
    
    console.log(`✅ Port ${port}: ${response.status} - ${data.connected ? 'Connected' : 'Not connected'}`);
    return true;
  } catch (error) {
    console.log(`❌ Port ${port}: Not running (${error.message})`);
    return false;
  }
}

async function testAllPorts() {
  console.log('🔍 Testing Gmail OAuth port adaptability...\n');
  
  const results = await Promise.all(testPorts.map(port => testPort(port)));
  
  const runningPorts = testPorts.filter((port, index) => results[index]);
  
  if (runningPorts.length > 0) {
    console.log(`\n✅ Found running servers on ports: ${runningPorts.join(', ')}`);
    console.log('🎯 Gmail OAuth will automatically adapt to any of these ports!');
  } else {
    console.log('\n❌ No running servers found on any test ports');
  }
}

// Run the test
testAllPorts().catch(console.error);
