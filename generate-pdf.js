const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  const htmlPath = path.resolve(__dirname, 'building_footprint_documentation.html');
  await page.goto(`file:///${htmlPath.replace(/\\/g, '/')}`, { waitUntil: 'networkidle0', timeout: 30000 });
  
  // Wait for Mermaid diagrams to render
  await page.waitForFunction(() => {
    const svgs = document.querySelectorAll('.mermaid svg');
    return svgs.length >= 2; // We have 2 mermaid diagrams
  }, { timeout: 15000 }).catch(() => console.log('Mermaid timeout, proceeding...'));
  
  await new Promise(r => setTimeout(r, 2000));
  
  const pdfPath = path.resolve(__dirname, 'Building_Footprint_Documentation.pdf');
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '18mm', right: '16mm', bottom: '18mm', left: '16mm' },
    displayHeaderFooter: false,
  });
  
  console.log(`PDF saved to: ${pdfPath}`);
  await browser.close();
})();
