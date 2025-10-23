# StockX Search API Reference

## Official Documentation

### Endpoint:
```
GET /catalog/search
```

### Description:
Search catalog API allows you to search the StockX catalog via:
- **Freeform text** (product names, brands)
- **GTIN** (UPC, EAN, ITF-14) - barcode numbers
- **styleId** - manufacturer style codes

The output is a paginated list of products that match the search term provided.

---

## Parameters

### `query` (required)
**Type:** string [1..100 characters]

Specifies a keyword, GTIN (UPC, EAN, ITF-14) or styleId string to search for products

**Examples:**
- Text search: `query=nike`
- GTIN search: `query=194817794556`
- Style ID search: `query=854262-106`

### `pageNumber` (optional)
**Type:** integer (int32) >= 1

Requested page number. By default, the page number starts at 1.

**Example:** `pageNumber=1`

### `pageSize` (optional)
**Type:** integer (int32) [1..50]

The number of products to return. By default, the page size starts at 1.

**Example:** `pageSize=10`

---

## Response Format

### Success (200)
```json
{
  "count": 266,
  "pageSize": 10,
  "pageNumber": 1,
  "hasNextPage": true,
  "products": [
    {
      "productId": "bf364c53-eb77-4522-955c-6a6ce952cc6f",
      "urlKey": "air-jordan-3-retro-og-rare-air",
      "styleId": "854262-106",
      "productType": "sneakers",
      "title": "Air Jordan 3 Retro OG 'Rare Air'",
      "brand": "Jordan",
      "productAttributes": {
        "gender": "men",
        "season": "FW21",
        "releaseDate": "2021-09-18",
        "retailPrice": 200,
        "colorway": "Fire Red/Cement Grey/Black",
        "color": "red"
      }
    }
  ]
}
```

---

## Search Methods

### 1. Text Search (Product Names, Brands)
Search by product name, brand, or keywords.

**Example:**
```
GET /catalog/search?query=nike&pageSize=10
```

**Use Cases:**
- General browsing: `nike`, `jordan`, `yeezy`
- Specific products: `Air Jordan 3 Rare Air`
- Brand + model: `Nike Dunk Low`

---

### 2. GTIN Search (Barcodes)
Search by UPC, EAN, or ITF-14 barcode numbers.

**Example:**
```
GET /catalog/search?query=194817794556&pageSize=10
```

**GTIN Types:**
- **UPC** - 12 digits (North America)
- **EAN** - 13 digits (International)
- **ITF-14** - 14 digits (Trade items)

**Use Cases:**
- Exact product matching
- Barcode scanner integration
- Inventory management
- Cross-platform matching

---

### 3. Style ID Search (SKU/Style Codes)
Search by manufacturer style/SKU codes.

**Example:**
```
GET /catalog/search?query=854262-106&pageSize=10
```

**Common Formats:**
- Nike/Jordan: `XX####-###` (e.g., `DJ0950-101`)
- Adidas: `X#####` (e.g., `H01234`)
- Generic: Various formats

**Use Cases:**
- Exact product matching
- Product verification
- Inventory management
- Cross-retailer matching

---

## Best Practices

### Search Priority:
1. **Style ID** - Most accurate, unique per colorway
2. **GTIN** - Very accurate, unique per product
3. **Text** - Good for browsing, may return multiple matches

### Pagination:
- Start with `pageSize=10` for most searches
- Use `pageNumber` to load more results
- Check `hasNextPage` to see if more results available

### Error Handling:
- **401** - Authentication required (check API key & JWT)
- **500** - Server error (retry with backoff)
- Empty results - Try broader search terms

---

## Integration Examples

### Search by Product Name:
```javascript
const response = await fetch(
  'https://api.stockx.com/v2/catalog/search?query=Air Jordan 3 Rare Air&pageSize=10',
  {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'x-api-key': apiKey
    }
  }
);
```

### Search by Style Code:
```javascript
const response = await fetch(
  'https://api.stockx.com/v2/catalog/search?query=854262-106&pageSize=10',
  {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'x-api-key': apiKey
    }
  }
);
```

### Search by GTIN:
```javascript
const response = await fetch(
  'https://api.stockx.com/v2/catalog/search?query=194817794556&pageSize=10',
  {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'x-api-key': apiKey
    }
  }
);
```

---

## Key Takeaways

✅ **Multi-format Search** - One API endpoint supports text, GTIN, and styleId
✅ **No Preprocessing Required** - Just pass the search term directly
✅ **Automatic Detection** - StockX automatically detects search type
✅ **Paginated Results** - Efficient handling of large result sets
✅ **Rich Product Data** - Returns complete product information

This is much more powerful than we initially thought!

