(async () => {
  try {
    const res = await fetch('http://localhost:3000/api/building-footprints/overture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bounds: { south: 12.97, west: 77.59, north: 12.973, east: 77.593 }
      })
    });
    console.log('Server overture endpoint status:', res.status);
    const data = await res.json();
    console.log('Returned elements:', data.elements ? data.elements.length : data);
  } catch (e) {
    console.log('Error testing endpoint:', e.message);
  }
})();
