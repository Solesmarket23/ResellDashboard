# StockX Arbitrage Search Guide

## 🔍 How to Search for Products

After analyzing the StockX API documentation and fixing search issues, here's your complete guide to searching for products in the StockX Arbitrage finder.

---

## ✅ What You Can Search For

### 1. **Product Names** (Recommended)
The most natural way to search. The API uses freeform text search.

**Examples:**
- `Air Jordan 3 Rare Air`
- `Jordan 1 Chicago`
- `Nike Dunk Low Panda`
- `Yeezy 350 Zebra`
- `Fear of God Essentials Hoodie`

**Tips:**
- Use 2-4 key words from the product name
- Include brand name for better results
- Don't need to match exactly - the API is smart about variations

---

### 2. **StockX Product URLs** ✨ NEW!
You can now paste any StockX product page URL directly!

**Examples:**
- `https://stockx.com/air-jordan-3-retro-og-rare-air`
- `https://stockx.com/nike-dunk-low-retro-white-black-panda-2021`
- `https://stockx.com/adidas-yeezy-boost-350-v2-zebra`

**How it works:**
- The system extracts the product slug (e.g., `air-jordan-3-retro-og-rare-air`)
- Converts it to searchable text (`air jordan 3 retro og rare air`)
- Searches for that specific product

---

### 3. **Style Codes / SKU**
If you know the exact style code, you can search for it. The API natively supports styleId search!

**Examples:**
- `854262-106` (Air Jordan 3 Rare Air)
- `DD1391-100` (Nike Dunk Low Panda)
- `CP9654` (Yeezy 350 Zebra)

**Note:** The StockX API returns products with a `styleId` field, which matches these codes exactly.

---

### 4. **GTIN / Barcodes** (Most Accurate!)
Search by product barcodes for exact matches. The API natively supports UPC, EAN, and ITF-14.

**Examples:**
- `194817794556` (12-digit UPC)
- `0194817794556` (13-digit EAN)
- `00194817794556` (14-digit ITF-14)

**What are GTINs?**
- **UPC** (12 digits) - Used in North America
- **EAN** (13 digits) - International standard
- **ITF-14** (14 digits) - Trade/shipping units

**Why use barcodes?**
- ✅ Most accurate matching (unique per product)
- ✅ Perfect for inventory management
- ✅ Great for cross-platform arbitrage
- ✅ Works with barcode scanners

---

### 5. **StockX Category URLs**
Browse trending categories directly.

**Examples:**
- `https://stockx.com/category/sneakers?sort=most-active`
- `https://stockx.com/category/apparel?sort=most-active`
- `https://stockx.com/category/accessories`

---

## 🎯 How the StockX API Actually Works

### API Endpoint:
```
GET https://api.stockx.com/v2/catalog/search?query={searchTerm}
```

### How Search Works:
The StockX API **automatically detects** what you're searching for and handles it appropriately:

1. **Text Search** - Product names, brands, keywords
2. **GTIN Search** - UPC, EAN, ITF-14 barcode numbers (12-14 digits)
3. **styleId Search** - Manufacturer style codes (e.g., `854262-106`)

Just pass your search term - StockX figures out which type it is!

### Returns Product Objects with:
- `productId` - Unique UUID (e.g., `"bf364c53-eb77-4522-955c-6a6ce952cc6f"`)
- `urlKey` - URL slug (e.g., `"air-jordan-3-retro-og-rare-air"`)
- `styleId` - Style/SKU code (e.g., `"854262-106"`)
- `title` - Product name (e.g., `"Air Jordan 3 Retro OG 'Rare Air'"`)
- `brand` - Brand name (e.g., `"Jordan"`)

### What's NOT Supported:
- ❌ Direct URL-to-product lookup (you can't pass a URL to the API)
- ❌ Search by `productId` (UUID)
- ❌ Advanced filters in search (filtering happens client-side)

**Note:** Our app converts product URLs to search terms automatically!

---

## 🔧 What Was Fixed

### Problem:
When you pasted `https://stockx.com/air-jordan-3-retro-og-rare-air`, the system treated the entire URL as a search query, which returned no results.

### Solution:
1. **Added URL Detection** - System now recognizes individual product URLs
2. **Extracts URL Key** - Pulls out `air-jordan-3-retro-og-rare-air` from the URL
3. **Converts to Search Text** - Transforms to `air jordan 3 retro og rare air`
4. **Searches StockX** - Uses the converted text to find the product

### Code Changes:
- `src/app/api/stockx/search/route.ts` - Enhanced URL parsing
- `src/components/StockXArbitrage.tsx` - Updated placeholder text

---

## 📋 Search Best Practices

### For Specific Products (Most to Least Accurate):

1. **Best: GTIN/Barcode** ⭐
   - Example: `194817794556`
   - Why: Unique identifier, exact match guaranteed
   - Use when: You have the barcode or doing cross-platform arbitrage

2. **Excellent: Style Code/SKU**
   - Example: `854262-106`
   - Why: Unique per colorway, very accurate
   - Use when: You know the manufacturer's style code

3. **Great: StockX Product URL**
   - Example: `https://stockx.com/air-jordan-3-retro-og-rare-air`
   - Why: Converted to search text automatically
   - Use when: Browsing StockX website

4. **Good: Product Name**
   - Example: `Air Jordan 3 Rare Air`
   - Why: Natural language, flexible
   - Use when: You don't have codes or URLs

### For General Searches:
1. **Brand + Model:** `Nike Dunk Low`
2. **Brand + Colorway:** `Jordan 1 Chicago`
3. **Just Brand:** `Nike` (returns many results)

### Tips:
- Be specific to reduce results
- Use 2-4 keywords for best results
- Style codes give exact matches
- Product URLs are the most accurate

---

## 🎬 Quick Start Examples

### Example 1: GTIN/Barcode (Most Accurate)
**Search:** `194817794556`
**Result:** Finds exact product via barcode - perfect for cross-platform arbitrage

### Example 2: Style Code
**Search:** `854262-106`
**Result:** Finds Air Jordan 3 "Rare Air" via manufacturer style code

### Example 3: Product URL
**Search:** `https://stockx.com/air-jordan-3-retro-og-rare-air`
**Result:** Finds the Air Jordan 3 "Rare Air" and shows arbitrage opportunities for all sizes

### Example 4: Product Name
**Search:** `Nike Dunk Low Panda`
**Result:** Finds the popular Panda colorway and shows pricing

### Example 5: Trending Category
**Search:** `https://stockx.com/category/sneakers?sort=most-active`
**Result:** Shows trending sneakers on StockX

---

## 🚀 Advanced Features

### Exclude Brands:
Add brands to exclude in the filter section to refine results

### Minimum Spread:
Set minimum profit margin to only see profitable opportunities

### Load More:
Click "Load More" to see additional products from search results

---

## ❓ Troubleshooting

### "No products found"
- Try using just the product name instead of the URL
- Make search less specific (fewer keywords)
- Check spelling of product name
- Try the style code if you know it

### "Authentication required"
- Connect your StockX account first
- Tokens may have expired - reconnect

### Wrong product found
- Be more specific in your search
- Use the style code for exact matches
- Use the full StockX product URL

---

## 📞 Need Help?

The search system now supports:
- ✅ **Product names** (e.g., `Air Jordan 3 Rare Air`)
- ✅ **Style codes** (e.g., `854262-106`) - Native API support!
- ✅ **GTIN/Barcodes** (e.g., `194817794556`) - Native API support!
- ✅ **StockX product URLs** (e.g., `https://stockx.com/air-jordan-3-retro-og-rare-air`)
- ✅ **Category URLs** (e.g., `https://stockx.com/category/sneakers`)

### Pro Tips:
1. **For most accurate results:** Use GTIN/barcode if available
2. **For specific products:** Use style code or product URL
3. **For browsing:** Use product names or category URLs

The StockX API automatically detects what type of search you're doing - just paste your search term and it works! 🚀

