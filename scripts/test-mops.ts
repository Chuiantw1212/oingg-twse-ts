// To run this script: npm run test:mops

/**
 * This script is for testing a POST request to the MOPS API endpoint t164sb03.
 * It sends a predefined payload and logs the full response for inspection.
 */
async function testMopsApi() {
  const API_URL = 'https://mops.twse.com.tw/mops/api/t164sb03';
  const payload = {
    companyId: '2330',
    dataType: '2',
    season: '1',
    year: '114',
    subsidiaryCompanyId: '',
  };

  console.log(`[TEST] Sending POST request to: ${API_URL}`);
  console.log('[TEST] Payload:', payload);
  console.log('--------------------------------------------------');

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // A common User-Agent is often required for such APIs to avoid being blocked.
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      body: JSON.stringify(payload),
    });

    console.log(`[RESPONSE] Status: ${response.status} ${response.statusText}`);
    console.log('[RESPONSE] Headers:');
    response.headers.forEach((value, key) => {
      console.log(`  ${key}: ${value}`);
    });
    console.log('--------------------------------------------------');

    const responseBodyText = await response.text();

    console.log('[RESPONSE] Body:');
    try {
      // Attempt to parse and pretty-print if it's JSON
      const jsonData = JSON.parse(responseBodyText);
      console.dir(jsonData, { depth: null });
    } catch (e) {
      // Otherwise, print as raw text
      console.log(responseBodyText);
    }
  } catch (error) {
    console.error('[ERROR] An unexpected error occurred during the fetch operation:', error);
  }
}

testMopsApi();