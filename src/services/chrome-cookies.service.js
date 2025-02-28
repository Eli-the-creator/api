const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");
const path = require("path");

const CHROME_COOKIES_DB = path.join(
  process.env.HOME || process.env.USERPROFILE,
  "Library/Application Support/Google/Chrome/Default/Network/Cookies"
);

function getCookies(domain) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(CHROME_COOKIES_DB)) {
      return reject(new Error("Cookies database not found"));
    }

    const db = new sqlite3.Database(
      CHROME_COOKIES_DB,
      sqlite3.OPEN_READONLY,
      (err) => {
        if (err) reject(err);
      }
    );

    const query = `SELECT host_key, name, value, path, expires_utc, is_secure, is_httponly FROM cookies WHERE host_key LIKE ?`;

    db.all(query, [`%${domain}%`], (err, rows) => {
      if (err) reject(err);

      const cookies = rows.map((row) => ({
        name: row.name,
        value: row.value,
        domain: row.host_key,
        path: row.path,
        expires: row.expires_utc / 1000000,
        secure: !!row.is_secure,
        httpOnly: !!row.is_httponly,
      }));

      db.close();
      resolve(cookies);
    });
  });
}

module.exports = { getCookies };
