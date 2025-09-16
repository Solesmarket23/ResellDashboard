# StockX Price Tracker Chrome Extension

A Chrome extension that displays average market prices and other market data on StockX product pages.

## Features

- 📊 Shows average prices on StockX product pages
- 💰 Displays last sale, highest bid, and lowest ask
- 🔄 Real-time data from your StockX API
- 🎨 Beautiful, non-intrusive UI widget
- 📱 Responsive design for all screen sizes

## Installation

1. **Open Chrome Extensions page**
   - Go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)

2. **Load the extension**
   - Click "Load unpacked"
   - Select the `chrome-extension` folder

3. **Configure your API**
   - Make sure your development server is running on `http://localhost:3000`
   - The extension uses your existing StockX API endpoints

## How it works

1. **Auto-detection**: The extension automatically detects when you're on a StockX product page
2. **API Integration**: It extracts the product info and searches your database
3. **Market Data**: Fetches current market data using your StockX API
4. **Display**: Shows the data in a beautiful widget at the top of the page

## API Endpoints Used

- `POST /api/stockx/search` - Search for products
- `GET /api/stockx/products/{id}/market-data` - Get market data

## Usage

1. Navigate to any StockX product page
2. The extension will automatically show market data
3. Click the × to close the widget
4. Use the popup to check status and refresh

## Development

### File Structure
```
chrome-extension/
├── manifest.json          # Extension configuration
├── content.js             # Main logic for StockX pages
├── background.js          # Background service worker
├── popup.html             # Extension popup UI
├── popup.js               # Popup functionality
├── styles.css             # Widget styling
└── icons/                 # Extension icons
```

### Key Components

- **Content Script**: Runs on StockX pages and injects the price widget
- **Background Script**: Handles API requests and messaging
- **Popup**: Provides extension status and controls

## Troubleshooting

### Common Issues

1. **"Failed to fetch market data"**
   - Make sure your dev server is running on port 3000
   - Check that your StockX API is working

2. **Widget not appearing**
   - Refresh the page
   - Check if you're on a product page (not search/category page)

3. **CORS errors**
   - The extension should handle CORS automatically
   - Make sure localhost:3000 is in the manifest permissions

### Debug Mode

Open Chrome DevTools on a StockX page to see console logs from the extension.

## Customization

### Change API URL
Edit the `apiBaseUrl` in `content.js`:
```javascript
this.apiBaseUrl = 'https://your-api-domain.com/api';
```

### Modify Widget Position
Update the `insertWidget()` method in `content.js` to change where the widget appears.

### Style Changes
Edit `styles.css` to customize the widget appearance.

## Version History

- **v1.0.0** - Initial release with basic market data display
