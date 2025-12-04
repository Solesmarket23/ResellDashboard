/**
 * Quick test to check if tracking number can be extracted from the provided email
 */

const { OrderConfirmationParser } = require('./src/lib/email/orderConfirmationParser');

// The email HTML provided by the user
const emailContent = `Delivered-To: solesmarket23@gmail.com
Received: by 2002:a05:7208:2c:b0:f2:e7ab:642c with SMTP id k12csp782037rbn;
        Wed, 3 Dec 2025 21:43:45 -0800 (PST)
Content-Transfer-Encoding: quoted-printable
Content-Type: text/html; charset=iso-8859-1
Date: Thu, 04 Dec 2025 05:43:43 +0000 (UTC)
From: StockX <noreply@stockx.com>
Subject: ✅ Order Verified & Shipped: Nike Blazer Mid 77 Vintage White Black
To: solesmarket23@gmail.com

<!DOCTYPE html> <html> <head>  <title></title>  <style type=3D"text/css"><!--...-->
<body bgcolor=3D"#eae8e3">
...email HTML content...
<li class=3D"attributes" style=3D"list-style-type: none; margin: 0;">Order number: 03-T4MV7BR007</li>
...more HTML...
Check out <a href=3D"https://us1.wizrocketmail.net/r?e=3D...&r=https%3A%2F%2Fstockx.com%2Fbuying%2F14800583785853838882%2F...">here</a> for up-to-date tracking information.
...more HTML...
</body> </html>`;

const parser = new OrderConfirmationParser(true); // Enable debug
const result = parser.parseEmail(emailContent);

console.log('\n📊 EXTRACTION RESULTS:');
console.log('Order Number:', result.order_number || 'NOT FOUND');
console.log('Tracking Number:', result.tracking_number || 'NOT FOUND');
console.log('Carrier:', result.carrier || 'NOT FOUND');
console.log('Status:', result.shipping_status || 'NOT FOUND');
console.log('Product:', result.product_name || 'NOT FOUND');

