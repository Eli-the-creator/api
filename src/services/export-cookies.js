
    const puppeteer = require('puppeteer');
    const fs = require('fs');
    const path = require('path');

    async function exportCookies() {
      const args = process.argv.slice(2);
      const url = args[0] || 'https://www.linkedin.com';
      const outputFile = args[1] || 'exported_cookies.json';
      
      console.log(`Exporting cookies for ${url} to ${outputFile}`);
      
      try {
        // Запускаем Chrome в режиме с графическим интерфейсом
        const browser = await puppeteer.launch({ 
          headless: false,
          args: ['--disable-web-security']
        });
        
        // Создаем новую страницу
        const page = await browser.newPage();
        
        // Переходим на нужный URL
        console.log(`Navigating to ${url}`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        
        // Ждем, чтобы пользователь мог войти в систему (30 секунд)
        console.log('Please log in manually if needed. Waiting 30 seconds...');
        await new Promise(resolve => setTimeout(resolve, 30000));
        
        // Получаем куки
        const cookies = await page.cookies();
        console.log(`Retrieved ${cookies.length} cookies`);
        
        // Преобразуем куки в формат Playwright
        const playwrightCookies = cookies.map(cookie => ({
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path,
          expires: cookie.expires,
          httpOnly: cookie.httpOnly,
          secure: cookie.secure,
          sameSite: cookie.sameSite || 'Lax'
        }));
        
        // Сохраняем куки в файл
        fs.writeFileSync(outputFile, JSON.stringify(playwrightCookies, null, 2));
        console.log(`Cookies saved to ${outputFile}`);
        
        // Закрываем браузер
        await browser.close();
        console.log('Browser closed. Cookie export complete.');
      } catch (error) {
        console.error('Error exporting cookies:', error);
        process.exit(1);
      }
    }

    exportCookies();
    