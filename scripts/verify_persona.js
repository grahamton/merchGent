import fetch from 'node-fetch';

async function testPersona() {
  console.log('🤖 Invoking Agent M with "Hybrid Experience Audit"...');
  console.log('----------------------------------------------------');

  const payload = {
    mode: 'Hybrid Experience Audit', // Triggers "Guardian of Catalog Integrity" Persona
    pageData: {
      url: 'https://test.com/laptops',
      title: 'Gaming Laptops',
      metaDescription: 'Buy Gaming Laptops',
      products: [
        {
          title: 'Alienware m15 R7',
          price: '$2,499.00',
          description: 'High performance gaming laptop.',
          b2bIndicators: [],
          b2cIndicators: ['Add to Cart'],
          ctaText: 'Add to Cart'
        },
        {
          title: 'Dell Latitude 5430',
          price: '', // Missing price -> should trigger persona "Gaps"
          description: '', // Missing description -> should trigger "Knowledge Gap"
          b2bIndicators: ['Request Quote'], // Mixed signal test
          b2cIndicators: [],
          ctaText: 'Request Quote'
        },
        {
            title: 'HP ZBook Firefly',
            price: '$1,899.00',
            description: 'Mobile Workstation.',
            b2bIndicators: [],
            b2cIndicators: ['Buy Now'],
            ctaText: 'Buy Now'
        },
        {
            title: 'Lenovo ThinkPad X1',
            price: 'Login for Pricing', // B2B signal
            description: '',
            b2bIndicators: ['Login for Pricing'],
            b2cIndicators: [],
            ctaText: 'Login'
        }
      ],
      structure: {
          gridSelector: '.product-grid',
          cardSelector: '.product-card',
          confidence: 85
      }
    }
  };

  try {
    const response = await fetch('http://localhost:3001/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API Error ${response.status}: ${errText}`);
    }

    const data = await response.json();

    const fs = await import('fs');
    fs.writeFileSync('verification_result.json', JSON.stringify(data, null, 2));
    console.log('✅ Report saved to verification_result.json');

  } catch (error) {
    console.error('❌ Verification Failed:', error.message);
  }
}

// Check if node-fetch is needed (Node < 18) or use global fetch
if (!globalThis.fetch) {
    console.log('Note: Using node-fetch shim if needed, but assuming Node 18+ environment.');
}

testPersona();
