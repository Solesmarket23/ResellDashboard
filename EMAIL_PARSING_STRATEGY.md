# Email Parsing Strategy & Requirements

## 🎯 **Data to Extract from Each Email**

### **Required Fields:**
1. **Product Name** - Full product name/title
2. **Brand** - Nike, Jordan, Adidas, etc.
3. **Order Number** - Unique identifier for the purchase
4. **Price Paid** - Actual amount paid (not retail price)
5. **Purchase Date** - When the order was placed
6. **Size** - Product size (if applicable)

### **Optional Fields:**
7. **Tracking Number** - Shipping tracking info
8. **Status** - Order status (placed, shipped, delivered, etc.)
9. **Market** - Which marketplace (StockX, GOAT, etc.)
10. **Product Image** - If available in email

## 🔍 **Email Analysis Strategy**

### **Phase 1: Structure Analysis**
- Analyze email HTML structure
- Identify common patterns across marketplaces
- Map where each data field appears

### **Phase 2: Pattern Development**
- Create specific regex patterns for each marketplace
- Build fallback patterns for edge cases
- Test against real email samples

### **Phase 3: Validation & Testing**
- Test with limited email samples (1, 10, 50)
- Validate extracted data accuracy
- Iterate and improve patterns

## 📧 **Email Analysis Methods**

### **Method 1: Email Screenshots**
```
Provide 2-3 screenshots of typical emails showing:
- Full email content
- Headers and metadata
- All relevant purchase information
```

### **Method 2: Email Content Export**
```
Export raw email content (HTML/text) for analysis:
- More precise than screenshots
- Allows for exact pattern matching
- Best for regex development
```

### **Method 3: Field-by-Field Specification**
```
For each marketplace, specify:
- Where product name appears
- How order numbers are formatted
- Price display format
- Date/time format
- Size information location
```

## 🛠 **Implementation Plan**

### **Step 1: Gather Email Samples**
- [ ] Get 2-3 sample emails from each marketplace
- [ ] Include different email types (order confirmation, shipping, delivery)
- [ ] Note any variations in format

### **Step 2: Build Marketplace-Specific Parsers**
- [ ] StockX email parser
- [ ] GOAT email parser  
- [ ] Other marketplace parsers

### **Step 3: Create Robust Extraction Logic**
- [ ] Multiple extraction patterns per field
- [ ] Confidence scoring for extracted data
- [ ] Fallback mechanisms for missing data

### **Step 4: Testing & Validation**
- [ ] Test with limited samples first
- [ ] Validate accuracy of extracted data
- [ ] Implement user feedback mechanism

## 📊 **Success Metrics**

- **Accuracy**: >95% correct extraction of core fields
- **Coverage**: Successfully parse >90% of emails
- **Reliability**: Consistent results across email variations
- **User Satisfaction**: Minimal manual corrections needed

## 🔧 **Technical Implementation**

### **Enhanced Parsing Function Structure**
```javascript
function parseEmailByMarketplace(email, marketplace) {
  switch(marketplace) {
    case 'StockX':
      return parseStockXEmail(email);
    case 'GOAT':
      return parseGoatEmail(email);
    // ... other marketplaces
  }
}
```

### **Field-Specific Extractors**
```javascript
function extractProductName(content, marketplace) {
  // Marketplace-specific product name extraction
}

function extractOrderNumber(content, marketplace) {
  // Marketplace-specific order number patterns
}

function extractPrice(content, marketplace) {
  // Marketplace-specific price extraction
}
```

## 📝 **Next Steps**

**What I need from you:**
1. **Sample emails** (screenshots or raw content) from your main marketplaces
2. **Priority ranking** of marketplaces (which are most important?)
3. **Accuracy requirements** (how perfect does this need to be?)

**What I'll deliver:**
1. **Marketplace-specific parsers** for accurate data extraction
2. **Confidence scoring** for extracted data
3. **Testing framework** for validation
4. **User-friendly error handling** for edge cases 