"""
ORDER CONFIRMATION EMAIL PARSER
===============================

🔄 CURSOR INTEGRATION INSTRUCTIONS:
-----------------------------------
1. REMOVE the existing Gmail email parser completely
2. REPLACE it entirely with this new OrderConfirmationParser
3. UPDATE your requirements.txt or install: pip install beautifulsoup4
4. REPLACE any existing parse functions with the new methods below:
   - Use parse_gmail_api_message() for Gmail API responses
   - Use parse_order_email_file() for .eml files
   - Use OrderInfo.to_dict() for structured data output

📋 DEPENDENCIES REQUIRED:
------------------------
Run: pip install beautifulsoup4

All other imports are built-in Python modules.

🎯 FEATURES:
-----------
- Supports StockX order confirmations (regular & Xpress)
- Extracts: product info, pricing, delivery dates, images, order numbers
- Validates order types against order number formats
- Handles both Gmail API and email files
- Robust error handling with multiple extraction patterns
- Clean, structured data output

"""

import re
import email
import base64
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dataclasses import dataclass
from typing import Optional, Dict, Any, List
from datetime import datetime
import html

# Dependency: beautifulsoup4
try:
    from bs4 import BeautifulSoup
except ImportError:
    print("ERROR: BeautifulSoup4 is required but not installed.")
    print("Please run: pip install beautifulsoup4")
    raise ImportError("Missing required dependency: beautifulsoup4")

@dataclass
class OrderInfo:
    """Structured order information extracted from email"""
    merchant: str = ""
    order_number: str = ""
    order_type: str = ""  # "regular", "xpress", etc.
    product_name: str = ""
    product_variant: str = ""  # color, style, etc.
    size: str = ""
    condition: str = ""
    style_id: str = ""
    
    # Product images
    product_image_url: str = ""
    product_image_alt: str = ""
    
    # Pricing breakdown
    purchase_price: float = 0.0
    processing_fee: float = 0.0
    shipping_fee: float = 0.0
    shipping_type: str = ""  # "Shipping", "Xpress Shipping"
    total_amount: float = 0.0
    currency: str = "USD"
    
    # Delivery information
    estimated_delivery_start: str = ""
    estimated_delivery_end: str = ""
    
    # Purchase information
    purchase_date: str = ""  # When the order was placed
    
    # Email metadata
    email_subject: str = ""
    email_date: str = ""
    sender: str = ""
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for easy serialization"""
        return {
            'merchant': self.merchant,
            'order_number': self.order_number,
            'order_type': self.order_type,
            'product_name': self.product_name,
            'product_variant': self.product_variant,
            'size': self.size,
            'condition': self.condition,
            'style_id': self.style_id,
            'product_image': {
                'url': self.product_image_url,
                'alt_text': self.product_image_alt
            },
            'pricing': {
                'purchase_price': self.purchase_price,
                'processing_fee': self.processing_fee,
                'shipping_fee': self.shipping_fee,
                'shipping_type': self.shipping_type,
                'total_amount': self.total_amount,
                'currency': self.currency
            },
            'delivery': {
                'estimated_start': self.estimated_delivery_start,
                'estimated_end': self.estimated_delivery_end
            },
            'purchase_info': {
                'purchase_date': self.purchase_date
            },
            'email_metadata': {
                'subject': self.email_subject,
                'date': self.email_date,
                'sender': self.sender
            }
        }

class OrderConfirmationParser:
    """Parse order confirmation emails from various merchants"""
    
    def __init__(self):
        self.supported_merchants = ['stockx']
        
    def parse_email(self, email_content: str) -> OrderInfo:
        """
        Parse an email and extract order information
        
        Args:
            email_content: Raw email content (EML format or HTML)
            
        Returns:
            OrderInfo object with extracted data
        """
        # Parse email if it's in EML format
        if email_content.startswith('Delivered-To:') or email_content.startswith('Return-Path:'):
            msg = email.message_from_string(email_content)
            return self._parse_email_message(msg)
        else:
            # Assume it's HTML content
            return self._parse_html_content(email_content)
    
    def _parse_email_message(self, msg: email.message.Message) -> OrderInfo:
        """Parse email message object"""
        order_info = OrderInfo()
        
        # Extract email metadata
        order_info.email_subject = self._decode_header(msg.get('Subject', ''))
        order_info.email_date = msg.get('Date', '')
        order_info.sender = msg.get('From', '')
        
        # Get HTML content
        html_content = self._get_html_content(msg)
        
        # Determine merchant and parse accordingly
        if 'stockx.com' in order_info.sender.lower() or 'stockx' in order_info.email_subject.lower():
            order_info.merchant = "StockX"
            self._parse_stockx_email(html_content, order_info)
        
        return order_info
    
    def _parse_html_content(self, html_content: str) -> OrderInfo:
        """Parse HTML content directly"""
        order_info = OrderInfo()
        
        # Try to determine merchant from content
        if 'stockx' in html_content.lower():
            order_info.merchant = "StockX"
            self._parse_stockx_email(html_content, order_info)
            
        return order_info
    
    def _parse_stockx_email(self, html_content: str, order_info: OrderInfo):
        """Parse StockX-specific email format"""
        
        # Clean HTML and extract text
        soup = BeautifulSoup(html_content, 'html.parser')
        text_content = soup.get_text()
        
        # Initial order type detection from subject/content
        if 'xpress order confirmed' in html_content.lower():
            order_info.order_type = "xpress"
        else:
            order_info.order_type = "regular"
        
        # Extract order number first (this may correct the order type)
        self._extract_stockx_order_number(text_content, order_info)
        
        # Extract other information
        self._extract_stockx_product_info(html_content, text_content, order_info)
        self._extract_stockx_product_image(html_content, order_info)
        self._extract_stockx_pricing(html_content, text_content, order_info)
        self._extract_stockx_delivery(html_content, text_content, order_info)
        self._extract_stockx_purchase_date(html_content, text_content, order_info)
    
    def _extract_stockx_product_info(self, html_content: str, text_content: str, order_info: OrderInfo):
        """Extract product details from StockX email"""
        
        # Product name patterns
        product_patterns = [
            r'(?:Subject:.*?Order Confirmed:|Xpress Order Confirmed:)\s*([^"]+?)(?:\s*(?:Chestnut|Grey|Black|White))?(?:\s*\(Women\'s\))?',
            r'<td[^>]*class="productName"[^>]*>.*?<a[^>]*>([^<]+)</a>',
            r'alt="([^"]+(?:Slipper|Sweatshirt|Shoe|Sneaker)[^"]*)"'
        ]
        
        for pattern in product_patterns:
            match = re.search(pattern, html_content, re.IGNORECASE | re.DOTALL)
            if match:
                order_info.product_name = match.group(1).strip()
                break
    
    def _extract_stockx_product_image(self, html_content: str, order_info: OrderInfo):
        """Extract product image URL from StockX email"""
        
        soup = BeautifulSoup(html_content, 'html.parser')
        
        # Look for product images in various ways
        image_patterns = [
            # Look for images with product names in alt text
            lambda: soup.find('img', alt=re.compile(r'(UGG|Denim Tears|Nike|Adidas|Jordan)', re.IGNORECASE)),
            
            # Look for images in product box sections
            lambda: soup.find('td', class_='productBoxImage').find('img') if soup.find('td', class_='productBoxImage') else None,
            
            # Look for images with stockx.com/images URLs
            lambda: soup.find('img', src=re.compile(r'images\.stockx\.com.*Product', re.IGNORECASE)),
            
            # Look for images with specific product-related alt text
            lambda: soup.find('img', alt=re.compile(r'(Slipper|Sweatshirt|Shoe|Sneaker|Hoodie)', re.IGNORECASE)),
            
            # Fallback: look for any images with product dimensions (usually product images)
            lambda: soup.find('img', width=re.compile(r'^(260|240|280)
        
        # Extract variant (color) from product name
        color_patterns = [
            r'\b(Chestnut|Grey|Gray|Black|White|Red|Blue|Green|Brown)\b'
        ]
        
        for pattern in color_patterns:
            match = re.search(pattern, order_info.product_name, re.IGNORECASE)
            if match:
                order_info.product_variant = match.group(1)
                break
        
        # Extract size
        size_patterns = [
            r'Size:\s*US\s*([XSMLW]*\s*\d+(?:\.\d+)?)',
            r'Size:\s*([XSMLW]+)',
            r'li[^>]*>Size:\s*([^<]+)</li>'
        ]
        
        for pattern in size_patterns:
            match = re.search(pattern, html_content, re.IGNORECASE)
            if match:
                order_info.size = match.group(1).strip()
                break
        
        # Extract condition
        condition_match = re.search(r'Condition:\s*([^<\n]+)', html_content, re.IGNORECASE)
        if condition_match:
            order_info.condition = condition_match.group(1).strip()
        
        # Extract style ID
        style_patterns = [
            r'Style ID:\s*([^<\n]+)',
            r'Style:\s*([^<\n]+)'
        ]
        
        for pattern in style_patterns:
            match = re.search(pattern, html_content, re.IGNORECASE)
            if match:
                order_info.style_id = match.group(1).strip()
                break
    
    def _extract_stockx_pricing(self, html_content: str, text_content: str, order_info: OrderInfo):
        """Extract pricing information from StockX email"""
        
        # Purchase Price
        price_patterns = [
            r'Purchase Price:.*?\$(\d+\.\d{2})',
            r'<td[^>]*>Purchase Price:</td>\s*<td[^>]*>\$(\d+\.\d{2})'
        ]
        
        for pattern in price_patterns:
            match = re.search(pattern, html_content, re.IGNORECASE | re.DOTALL)
            if match:
                order_info.purchase_price = float(match.group(1))
                break
        
        # Processing Fee
        processing_patterns = [
            r'Processing Fee:.*?\$(\d+\.\d{2})',
            r'<td[^>]*>Processing Fee:</td>\s*<td[^>]*>\$(\d+\.\d{2})'
        ]
        
        for pattern in processing_patterns:
            match = re.search(pattern, html_content, re.IGNORECASE | re.DOTALL)
            if match:
                order_info.processing_fee = float(match.group(1))
                break
        
        # Shipping
        shipping_patterns = [
            r'(Xpress Shipping|Shipping):.*?\$(\d+\.\d{2})',
            r'<td[^>]*>(Xpress Shipping|Shipping):</td>\s*<td[^>]*>\$(\d+\.\d{2})'
        ]
        
        for pattern in shipping_patterns:
            match = re.search(pattern, html_content, re.IGNORECASE | re.DOTALL)
            if match:
                order_info.shipping_type = match.group(1)
                order_info.shipping_fee = float(match.group(2))
                break
        
        # Total
        total_patterns = [
            r'Total Payment.*?\$(\d+\.\d{2})\*?',
            r'<td[^>]*>.*?Total Payment.*?</td>\s*<td[^>]*>\$(\d+\.\d{2})\*?'
        ]
        
        for pattern in total_patterns:
            match = re.search(pattern, html_content, re.IGNORECASE | re.DOTALL)
            if match:
                order_info.total_amount = float(match.group(1))
                break
    
    def _extract_stockx_delivery(self, html_content: str, text_content: str, order_info: OrderInfo):
        """Extract delivery information from StockX email"""
        
        # Delivery date patterns
        delivery_patterns = [
            r'Estimated (?:Arrival|Delivery)(?: Date)?:\s*(?:<[^>]*>)*([A-Za-z]+ \d+, \d{4})\s*-\s*([A-Za-z]+ \d+, \d{4})',
            r'expect to receive it by ([A-Za-z]+ \d+, \d{4})',
            r'(\w+ \d+, \d{4})\s*-\s*(\w+ \d+, \d{4})'
        ]
        
        for pattern in delivery_patterns:
            match = re.search(pattern, html_content, re.IGNORECASE | re.DOTALL)
            if match:
                if len(match.groups()) == 2:
                    order_info.estimated_delivery_start = match.group(1).strip()
                    order_info.estimated_delivery_end = match.group(2).strip()
                else:
                    order_info.estimated_delivery_end = match.group(1).strip()
                break
    
    def _extract_stockx_order_number(self, text_content: str, order_info: OrderInfo):
        """Extract order number from StockX email and validate order type"""
        
        order_patterns = [
            r'Order number:\s*([A-Z0-9-]+)',
            r'Order Number:\s*([A-Z0-9-]+)',
            r'Order:\s*([A-Z0-9-]+)'
        ]
        
        for pattern in order_patterns:
            match = re.search(pattern, text_content, re.IGNORECASE)
            if match:
                order_number = match.group(1).strip()
                order_info.order_number = order_number
                
                # Validate and potentially correct order type based on order number format
                if self._is_xpress_order_number(order_number):
                    # If we detected xpress format but hadn't set type as xpress, correct it
                    if order_info.order_type != "xpress":
                        order_info.order_type = "xpress"
                elif self._is_regular_order_number(order_number):
                    # If we detected regular format but had set type as xpress, correct it
                    if order_info.order_type == "xpress":
                        order_info.order_type = "regular"
                break
    
    def _is_xpress_order_number(self, order_number: str) -> bool:
        """Check if order number matches Xpress format: 2 chars/digits, hyphen, then more"""
        xpress_pattern = r'^\d{2}-[A-Z0-9]+
    
    def _get_html_content(self, msg: email.message.Message) -> str:
        """Extract HTML content from email message"""
        if msg.is_multipart():
            for part in msg.walk():
                if part.get_content_type() == "text/html":
                    return part.get_payload(decode=True).decode('utf-8', errors='ignore')
        else:
            if msg.get_content_type() == "text/html":
                return msg.get_payload(decode=True).decode('utf-8', errors='ignore')
        return ""
    
    def _decode_header(self, header: str) -> str:
        """Decode email header"""
        decoded_parts = email.header.decode_header(header)
        decoded_header = ""
        for part, encoding in decoded_parts:
            if isinstance(part, bytes):
                decoded_header += part.decode(encoding or 'utf-8', errors='ignore')
            else:
                decoded_header += part
        return decoded_header

# 🔄 CURSOR: REPLACE YOUR EXISTING PARSER WITH THESE FUNCTIONS
# =============================================================

def parse_order_email_file(file_path: str) -> OrderInfo:
    """
    🔄 CURSOR: Use this to replace your existing email file parser
    
    Parse an order confirmation email from a file
    
    Args:
        file_path: Path to the email file (.eml format)
        
    Returns:
        OrderInfo object with extracted data
    """
    parser = OrderConfirmationParser()
    
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        email_content = f.read()
    
    return parser.parse_email(email_content)

def parse_gmail_api_message(gmail_message: Dict[str, Any]) -> OrderInfo:
    """
    🔄 CURSOR: Use this to replace your existing Gmail API parser
    
    Parse an order confirmation email from Gmail API response
    
    Args:
        gmail_message: Gmail API message object
        
    Returns:
        OrderInfo object with extracted data
    """
    parser = OrderConfirmationParser()
    
    # Extract HTML content from Gmail API payload
    html_content = ""
    if 'payload' in gmail_message:
        payload = gmail_message['payload']
        
        if 'parts' in payload:
            for part in payload['parts']:
                if part.get('mimeType') == 'text/html':
                    body_data = part.get('body', {}).get('data', '')
                    if body_data:
                        html_content = base64.urlsafe_b64decode(body_data).decode('utf-8', errors='ignore')
                        break
    
    def _extract_stockx_purchase_date(self, html_content: str, text_content: str, order_info: OrderInfo):
        """Extract purchase date from StockX email"""
        
        # Try to find explicit purchase date in email content first
        purchase_date_patterns = [
            r'Order Date:\s*([A-Za-z]+ \d+, \d{4})',
            r'Purchase Date:\s*([A-Za-z]+ \d+, \d{4})',
            r'Placed on:\s*([A-Za-z]+ \d+, \d{4})',
            r'Order placed:\s*([A-Za-z]+ \d+, \d{4})'
        ]
        
        for pattern in purchase_date_patterns:
            match = re.search(pattern, html_content, re.IGNORECASE)
            if match:
                order_info.purchase_date = match.group(1).strip()
                return
        
        # If no explicit purchase date found, use email date as fallback
        # This is typically accurate for order confirmations since they're sent immediately
        if order_info.email_date and not order_info.purchase_date:
            # Parse email date and format it consistently
            try:
                # Email dates are usually in RFC format, try to parse and reformat
                from email.utils import parsedate_to_datetime
                parsed_date = parsedate_to_datetime(order_info.email_date)
                # Format as "Month Day, Year" to match other date formats in the system
                order_info.purchase_date = parsed_date.strftime("%B %d, %Y")
            except:
                # If parsing fails, just use the raw email date
                order_info.purchase_date = order_info.email_date
        elif payload.get('mimeType') == 'text/html':
            body_data = payload.get('body', {}).get('data', '')
            if body_data:
                html_content = base64.urlsafe_b64decode(body_data).decode('utf-8', errors='ignore')
    
    order_info = parser._parse_html_content(html_content)
    
    # Extract metadata from Gmail API headers
    headers = gmail_message.get('payload', {}).get('headers', [])
    for header in headers:
        name = header.get('name', '').lower()
        value = header.get('value', '')
        
        if name == 'subject':
            order_info.email_subject = value
        elif name == 'from':
            order_info.sender = value
        elif name == 'date':
            order_info.email_date = value
    
    return order_info

# 🔄 CURSOR: EXAMPLE USAGE TO REPLACE YOUR EXISTING CODE
# ======================================================
if __name__ == "__main__":
    """
    🔄 CURSOR: Replace your existing usage examples with these:
    """
    
    # Example 1: Parse Gmail API message
    # gmail_message = {...}  # Your Gmail API response
    # order_info = parse_gmail_api_message(gmail_message)
    # order_dict = order_info.to_dict()
    # print(f"Order {order_dict['order_number']}: {order_dict['product_name']}")
    # print(f"Total: ${order_dict['pricing']['total_amount']}")
    # print(f"Image: {order_dict['product_image']['url']}")
    
    # Example 2: Parse email file
    # order_info = parse_order_email_file("order_confirmation.eml")
    # print(order_info.to_dict())
    
    print("🔄 Order Confirmation Email Parser - Ready for Cursor Integration!")
    print("📋 Supported: StockX (regular & Xpress orders)")
    print("📦 Required: pip install beautifulsoup4")
    print("🎯 Features: Product info, pricing, delivery, images, order validation")

        return bool(re.match(xpress_pattern, order_number))
    
    def _is_regular_order_number(self, order_number: str) -> bool:
        """Check if order number matches regular format: ~8 digits, no hyphen"""
        regular_pattern = r'^\d{7,9}
    
    def _get_html_content(self, msg: email.message.Message) -> str:
        """Extract HTML content from email message"""
        if msg.is_multipart():
            for part in msg.walk():
                if part.get_content_type() == "text/html":
                    return part.get_payload(decode=True).decode('utf-8', errors='ignore')
        else:
            if msg.get_content_type() == "text/html":
                return msg.get_payload(decode=True).decode('utf-8', errors='ignore')
        return ""
    
    def _decode_header(self, header: str) -> str:
        """Decode email header"""
        decoded_parts = email.header.decode_header(header)
        decoded_header = ""
        for part, encoding in decoded_parts:
            if isinstance(part, bytes):
                decoded_header += part.decode(encoding or 'utf-8', errors='ignore')
            else:
                decoded_header += part
        return decoded_header

# Usage example and helper functions
def parse_order_email_file(file_path: str) -> OrderInfo:
    """
    Parse an order confirmation email from a file
    
    Args:
        file_path: Path to the email file (.eml format)
        
    Returns:
        OrderInfo object with extracted data
    """
    parser = OrderConfirmationParser()
    
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        email_content = f.read()
    
    return parser.parse_email(email_content)

def parse_gmail_api_message(gmail_message: Dict[str, Any]) -> OrderInfo:
    """
    Parse an order confirmation email from Gmail API response
    
    Args:
        gmail_message: Gmail API message object
        
    Returns:
        OrderInfo object with extracted data
    """
    parser = OrderConfirmationParser()
    
    # Extract HTML content from Gmail API payload
    html_content = ""
    if 'payload' in gmail_message:
        payload = gmail_message['payload']
        
        if 'parts' in payload:
            for part in payload['parts']:
                if part.get('mimeType') == 'text/html':
                    body_data = part.get('body', {}).get('data', '')
                    if body_data:
                        import base64
                        html_content = base64.urlsafe_b64decode(body_data).decode('utf-8', errors='ignore')
                        break
        elif payload.get('mimeType') == 'text/html':
            body_data = payload.get('body', {}).get('data', '')
            if body_data:
                import base64
                html_content = base64.urlsafe_b64decode(body_data).decode('utf-8', errors='ignore')
    
    order_info = parser._parse_html_content(html_content)
    
    # Extract metadata from Gmail API headers
    headers = gmail_message.get('payload', {}).get('headers', [])
    for header in headers:
        name = header.get('name', '').lower()
        value = header.get('value', '')
        
        if name == 'subject':
            order_info.email_subject = value
        elif name == 'from':
            order_info.sender = value
        elif name == 'date':
            order_info.email_date = value
    
    return order_info

# Example usage
if __name__ == "__main__":
    # Example: Parse a local email file
    # order_info = parse_order_email_file("order_confirmation.eml")
    # print(order_info.to_dict())
    
    # Example: Parse Gmail API message
    # gmail_message = {...}  # Gmail API response
    # order_info = parse_gmail_api_message(gmail_message)
    # print(order_info.to_dict())
    
    print("Order Confirmation Email Parser ready!")
    print("Supported merchants: StockX")
    print("Supported order types: Regular orders, Xpress orders")
  # 7-9 digits to be flexible
        return bool(re.match(regular_pattern, order_number))
    
    def _get_html_content(self, msg: email.message.Message) -> str:
        """Extract HTML content from email message"""
        if msg.is_multipart():
            for part in msg.walk():
                if part.get_content_type() == "text/html":
                    return part.get_payload(decode=True).decode('utf-8', errors='ignore')
        else:
            if msg.get_content_type() == "text/html":
                return msg.get_payload(decode=True).decode('utf-8', errors='ignore')
        return ""
    
    def _decode_header(self, header: str) -> str:
        """Decode email header"""
        decoded_parts = email.header.decode_header(header)
        decoded_header = ""
        for part, encoding in decoded_parts:
            if isinstance(part, bytes):
                decoded_header += part.decode(encoding or 'utf-8', errors='ignore')
            else:
                decoded_header += part
        return decoded_header

# Usage example and helper functions
def parse_order_email_file(file_path: str) -> OrderInfo:
    """
    Parse an order confirmation email from a file
    
    Args:
        file_path: Path to the email file (.eml format)
        
    Returns:
        OrderInfo object with extracted data
    """
    parser = OrderConfirmationParser()
    
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        email_content = f.read()
    
    return parser.parse_email(email_content)

def parse_gmail_api_message(gmail_message: Dict[str, Any]) -> OrderInfo:
    """
    Parse an order confirmation email from Gmail API response
    
    Args:
        gmail_message: Gmail API message object
        
    Returns:
        OrderInfo object with extracted data
    """
    parser = OrderConfirmationParser()
    
    # Extract HTML content from Gmail API payload
    html_content = ""
    if 'payload' in gmail_message:
        payload = gmail_message['payload']
        
        if 'parts' in payload:
            for part in payload['parts']:
                if part.get('mimeType') == 'text/html':
                    body_data = part.get('body', {}).get('data', '')
                    if body_data:
                        import base64
                        html_content = base64.urlsafe_b64decode(body_data).decode('utf-8', errors='ignore')
                        break
        elif payload.get('mimeType') == 'text/html':
            body_data = payload.get('body', {}).get('data', '')
            if body_data:
                import base64
                html_content = base64.urlsafe_b64decode(body_data).decode('utf-8', errors='ignore')
    
    order_info = parser._parse_html_content(html_content)
    
    # Extract metadata from Gmail API headers
    headers = gmail_message.get('payload', {}).get('headers', [])
    for header in headers:
        name = header.get('name', '').lower()
        value = header.get('value', '')
        
        if name == 'subject':
            order_info.email_subject = value
        elif name == 'from':
            order_info.sender = value
        elif name == 'date':
            order_info.email_date = value
    
    return order_info

# Example usage
if __name__ == "__main__":
    # Example: Parse a local email file
    # order_info = parse_order_email_file("order_confirmation.eml")
    # print(order_info.to_dict())
    
    # Example: Parse Gmail API message
    # gmail_message = {...}  # Gmail API response
    # order_info = parse_gmail_api_message(gmail_message)
    # print(order_info.to_dict())
    
    print("Order Confirmation Email Parser ready!")
    print("Supported merchants: StockX")
    print("Supported order types: Regular orders, Xpress orders")
)),
        ]
        
        product_img = None
        for pattern_func in image_patterns:
            try:
                product_img = pattern_func()
                if product_img and product_img.get('src'):
                    break
            except:
                continue
        
        if product_img:
            # Extract image URL
            img_src = product_img.get('src', '')
            
            # Clean up the URL if it has StockX image parameters
            if 'images.stockx.com' in img_src:
                # Remove StockX image processing parameters for cleaner URL
                base_url = img_src.split('?')[0]  # Remove query parameters
                order_info.product_image_url = base_url
            else:
                order_info.product_image_url = img_src
            
            # Extract alt text
            order_info.product_image_alt = product_img.get('alt', '')
        
        # If no image found, try regex patterns on raw HTML
        if not order_info.product_image_url:
            image_url_patterns = [
                r'src="(https://images\.stockx\.com/images/[^"]*Product[^"]*\.jpg)',
                r'src="(https://images\.stockx\.com/images/[^"]*Product[^"]*)"',
                r'<img[^>]*alt="([^"]*(?:Slipper|Sweatshirt|Shoe|Sneaker)[^"]*)"[^>]*src="([^"]+)"',
                r'<img[^>]*src="([^"]+)"[^>]*alt="([^"]*(?:Slipper|Sweatshirt|Shoe|Sneaker)[^"]*)"'
            ]
            
            for pattern in image_url_patterns:
                match = re.search(pattern, html_content, re.IGNORECASE)
                if match:
                    if len(match.groups()) == 1:
                        order_info.product_image_url = match.group(1)
                    elif len(match.groups()) == 2:
                        # Check which group is the URL and which is alt text
                        group1, group2 = match.groups()
                        if group1.startswith('http'):
                            order_info.product_image_url = group1
                            order_info.product_image_alt = group2
                        else:
                            order_info.product_image_url = group2
                            order_info.product_image_alt = group1
                    break
        
        # Extract variant (color) from product name
        color_patterns = [
            r'\b(Chestnut|Grey|Gray|Black|White|Red|Blue|Green|Brown)\b'
        ]
        
        for pattern in color_patterns:
            match = re.search(pattern, order_info.product_name, re.IGNORECASE)
            if match:
                order_info.product_variant = match.group(1)
                break
        
        # Extract size
        size_patterns = [
            r'Size:\s*US\s*([XSMLW]*\s*\d+(?:\.\d+)?)',
            r'Size:\s*([XSMLW]+)',
            r'li[^>]*>Size:\s*([^<]+)</li>'
        ]
        
        for pattern in size_patterns:
            match = re.search(pattern, html_content, re.IGNORECASE)
            if match:
                order_info.size = match.group(1).strip()
                break
        
        # Extract condition
        condition_match = re.search(r'Condition:\s*([^<\n]+)', html_content, re.IGNORECASE)
        if condition_match:
            order_info.condition = condition_match.group(1).strip()
        
        # Extract style ID
        style_patterns = [
            r'Style ID:\s*([^<\n]+)',
            r'Style:\s*([^<\n]+)'
        ]
        
        for pattern in style_patterns:
            match = re.search(pattern, html_content, re.IGNORECASE)
            if match:
                order_info.style_id = match.group(1).strip()
                break
    
    def _extract_stockx_pricing(self, html_content: str, text_content: str, order_info: OrderInfo):
        """Extract pricing information from StockX email"""
        
        # Purchase Price
        price_patterns = [
            r'Purchase Price:.*?\$(\d+\.\d{2})',
            r'<td[^>]*>Purchase Price:</td>\s*<td[^>]*>\$(\d+\.\d{2})'
        ]
        
        for pattern in price_patterns:
            match = re.search(pattern, html_content, re.IGNORECASE | re.DOTALL)
            if match:
                order_info.purchase_price = float(match.group(1))
                break
        
        # Processing Fee
        processing_patterns = [
            r'Processing Fee:.*?\$(\d+\.\d{2})',
            r'<td[^>]*>Processing Fee:</td>\s*<td[^>]*>\$(\d+\.\d{2})'
        ]
        
        for pattern in processing_patterns:
            match = re.search(pattern, html_content, re.IGNORECASE | re.DOTALL)
            if match:
                order_info.processing_fee = float(match.group(1))
                break
        
        # Shipping
        shipping_patterns = [
            r'(Xpress Shipping|Shipping):.*?\$(\d+\.\d{2})',
            r'<td[^>]*>(Xpress Shipping|Shipping):</td>\s*<td[^>]*>\$(\d+\.\d{2})'
        ]
        
        for pattern in shipping_patterns:
            match = re.search(pattern, html_content, re.IGNORECASE | re.DOTALL)
            if match:
                order_info.shipping_type = match.group(1)
                order_info.shipping_fee = float(match.group(2))
                break
        
        # Total
        total_patterns = [
            r'Total Payment.*?\$(\d+\.\d{2})\*?',
            r'<td[^>]*>.*?Total Payment.*?</td>\s*<td[^>]*>\$(\d+\.\d{2})\*?'
        ]
        
        for pattern in total_patterns:
            match = re.search(pattern, html_content, re.IGNORECASE | re.DOTALL)
            if match:
                order_info.total_amount = float(match.group(1))
                break
    
    def _extract_stockx_delivery(self, html_content: str, text_content: str, order_info: OrderInfo):
        """Extract delivery information from StockX email"""
        
        # Delivery date patterns
        delivery_patterns = [
            r'Estimated (?:Arrival|Delivery)(?: Date)?:\s*(?:<[^>]*>)*([A-Za-z]+ \d+, \d{4})\s*-\s*([A-Za-z]+ \d+, \d{4})',
            r'expect to receive it by ([A-Za-z]+ \d+, \d{4})',
            r'(\w+ \d+, \d{4})\s*-\s*(\w+ \d+, \d{4})'
        ]
        
        for pattern in delivery_patterns:
            match = re.search(pattern, html_content, re.IGNORECASE | re.DOTALL)
            if match:
                if len(match.groups()) == 2:
                    order_info.estimated_delivery_start = match.group(1).strip()
                    order_info.estimated_delivery_end = match.group(2).strip()
                else:
                    order_info.estimated_delivery_end = match.group(1).strip()
                break
    
    def _extract_stockx_order_number(self, text_content: str, order_info: OrderInfo):
        """Extract order number from StockX email and validate order type"""
        
        order_patterns = [
            r'Order number:\s*([A-Z0-9-]+)',
            r'Order Number:\s*([A-Z0-9-]+)',
            r'Order:\s*([A-Z0-9-]+)'
        ]
        
        for pattern in order_patterns:
            match = re.search(pattern, text_content, re.IGNORECASE)
            if match:
                order_number = match.group(1).strip()
                order_info.order_number = order_number
                
                # Validate and potentially correct order type based on order number format
                if self._is_xpress_order_number(order_number):
                    # If we detected xpress format but hadn't set type as xpress, correct it
                    if order_info.order_type != "xpress":
                        order_info.order_type = "xpress"
                elif self._is_regular_order_number(order_number):
                    # If we detected regular format but had set type as xpress, correct it
                    if order_info.order_type == "xpress":
                        order_info.order_type = "regular"
                break
    
    def _is_xpress_order_number(self, order_number: str) -> bool:
        """Check if order number matches Xpress format: 2 chars/digits, hyphen, then more"""
        xpress_pattern = r'^\d{2}-[A-Z0-9]+
    
    def _get_html_content(self, msg: email.message.Message) -> str:
        """Extract HTML content from email message"""
        if msg.is_multipart():
            for part in msg.walk():
                if part.get_content_type() == "text/html":
                    return part.get_payload(decode=True).decode('utf-8', errors='ignore')
        else:
            if msg.get_content_type() == "text/html":
                return msg.get_payload(decode=True).decode('utf-8', errors='ignore')
        return ""
    
    def _decode_header(self, header: str) -> str:
        """Decode email header"""
        decoded_parts = email.header.decode_header(header)
        decoded_header = ""
        for part, encoding in decoded_parts:
            if isinstance(part, bytes):
                decoded_header += part.decode(encoding or 'utf-8', errors='ignore')
            else:
                decoded_header += part
        return decoded_header

# Usage example and helper functions
def parse_order_email_file(file_path: str) -> OrderInfo:
    """
    Parse an order confirmation email from a file
    
    Args:
        file_path: Path to the email file (.eml format)
        
    Returns:
        OrderInfo object with extracted data
    """
    parser = OrderConfirmationParser()
    
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        email_content = f.read()
    
    return parser.parse_email(email_content)

def parse_gmail_api_message(gmail_message: Dict[str, Any]) -> OrderInfo:
    """
    Parse an order confirmation email from Gmail API response
    
    Args:
        gmail_message: Gmail API message object
        
    Returns:
        OrderInfo object with extracted data
    """
    parser = OrderConfirmationParser()
    
    # Extract HTML content from Gmail API payload
    html_content = ""
    if 'payload' in gmail_message:
        payload = gmail_message['payload']
        
        if 'parts' in payload:
            for part in payload['parts']:
                if part.get('mimeType') == 'text/html':
                    body_data = part.get('body', {}).get('data', '')
                    if body_data:
                        import base64
                        html_content = base64.urlsafe_b64decode(body_data).decode('utf-8', errors='ignore')
                        break
        elif payload.get('mimeType') == 'text/html':
            body_data = payload.get('body', {}).get('data', '')
            if body_data:
                import base64
                html_content = base64.urlsafe_b64decode(body_data).decode('utf-8', errors='ignore')
    
    order_info = parser._parse_html_content(html_content)
    
    # Extract metadata from Gmail API headers
    headers = gmail_message.get('payload', {}).get('headers', [])
    for header in headers:
        name = header.get('name', '').lower()
        value = header.get('value', '')
        
        if name == 'subject':
            order_info.email_subject = value
        elif name == 'from':
            order_info.sender = value
        elif name == 'date':
            order_info.email_date = value
    
    return order_info

# Example usage
if __name__ == "__main__":
    # Example: Parse a local email file
    # order_info = parse_order_email_file("order_confirmation.eml")
    # print(order_info.to_dict())
    
    # Example: Parse Gmail API message
    # gmail_message = {...}  # Gmail API response
    # order_info = parse_gmail_api_message(gmail_message)
    # print(order_info.to_dict())
    
    print("Order Confirmation Email Parser ready!")
    print("Supported merchants: StockX")
    print("Supported order types: Regular orders, Xpress orders")

        return bool(re.match(xpress_pattern, order_number))
    
    def _is_regular_order_number(self, order_number: str) -> bool:
        """Check if order number matches regular format: ~8 digits, no hyphen"""
        regular_pattern = r'^\d{7,9}
    
    def _get_html_content(self, msg: email.message.Message) -> str:
        """Extract HTML content from email message"""
        if msg.is_multipart():
            for part in msg.walk():
                if part.get_content_type() == "text/html":
                    return part.get_payload(decode=True).decode('utf-8', errors='ignore')
        else:
            if msg.get_content_type() == "text/html":
                return msg.get_payload(decode=True).decode('utf-8', errors='ignore')
        return ""
    
    def _decode_header(self, header: str) -> str:
        """Decode email header"""
        decoded_parts = email.header.decode_header(header)
        decoded_header = ""
        for part, encoding in decoded_parts:
            if isinstance(part, bytes):
                decoded_header += part.decode(encoding or 'utf-8', errors='ignore')
            else:
                decoded_header += part
        return decoded_header

# Usage example and helper functions
def parse_order_email_file(file_path: str) -> OrderInfo:
    """
    Parse an order confirmation email from a file
    
    Args:
        file_path: Path to the email file (.eml format)
        
    Returns:
        OrderInfo object with extracted data
    """
    parser = OrderConfirmationParser()
    
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        email_content = f.read()
    
    return parser.parse_email(email_content)

def parse_gmail_api_message(gmail_message: Dict[str, Any]) -> OrderInfo:
    """
    Parse an order confirmation email from Gmail API response
    
    Args:
        gmail_message: Gmail API message object
        
    Returns:
        OrderInfo object with extracted data
    """
    parser = OrderConfirmationParser()
    
    # Extract HTML content from Gmail API payload
    html_content = ""
    if 'payload' in gmail_message:
        payload = gmail_message['payload']
        
        if 'parts' in payload:
            for part in payload['parts']:
                if part.get('mimeType') == 'text/html':
                    body_data = part.get('body', {}).get('data', '')
                    if body_data:
                        import base64
                        html_content = base64.urlsafe_b64decode(body_data).decode('utf-8', errors='ignore')
                        break
        elif payload.get('mimeType') == 'text/html':
            body_data = payload.get('body', {}).get('data', '')
            if body_data:
                import base64
                html_content = base64.urlsafe_b64decode(body_data).decode('utf-8', errors='ignore')
    
    order_info = parser._parse_html_content(html_content)
    
    # Extract metadata from Gmail API headers
    headers = gmail_message.get('payload', {}).get('headers', [])
    for header in headers:
        name = header.get('name', '').lower()
        value = header.get('value', '')
        
        if name == 'subject':
            order_info.email_subject = value
        elif name == 'from':
            order_info.sender = value
        elif name == 'date':
            order_info.email_date = value
    
    return order_info

# Example usage
if __name__ == "__main__":
    # Example: Parse a local email file
    # order_info = parse_order_email_file("order_confirmation.eml")
    # print(order_info.to_dict())
    
    # Example: Parse Gmail API message
    # gmail_message = {...}  # Gmail API response
    # order_info = parse_gmail_api_message(gmail_message)
    # print(order_info.to_dict())
    
    print("Order Confirmation Email Parser ready!")
    print("Supported merchants: StockX")
    print("Supported order types: Regular orders, Xpress orders")
  # 7-9 digits to be flexible
        return bool(re.match(regular_pattern, order_number))
    
    def _get_html_content(self, msg: email.message.Message) -> str:
        """Extract HTML content from email message"""
        if msg.is_multipart():
            for part in msg.walk():
                if part.get_content_type() == "text/html":
                    return part.get_payload(decode=True).decode('utf-8', errors='ignore')
        else:
            if msg.get_content_type() == "text/html":
                return msg.get_payload(decode=True).decode('utf-8', errors='ignore')
        return ""
    
    def _decode_header(self, header: str) -> str:
        """Decode email header"""
        decoded_parts = email.header.decode_header(header)
        decoded_header = ""
        for part, encoding in decoded_parts:
            if isinstance(part, bytes):
                decoded_header += part.decode(encoding or 'utf-8', errors='ignore')
            else:
                decoded_header += part
        return decoded_header

# Usage example and helper functions
def parse_order_email_file(file_path: str) -> OrderInfo:
    """
    Parse an order confirmation email from a file
    
    Args:
        file_path: Path to the email file (.eml format)
        
    Returns:
        OrderInfo object with extracted data
    """
    parser = OrderConfirmationParser()
    
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        email_content = f.read()
    
    return parser.parse_email(email_content)

def parse_gmail_api_message(gmail_message: Dict[str, Any]) -> OrderInfo:
    """
    Parse an order confirmation email from Gmail API response
    
    Args:
        gmail_message: Gmail API message object
        
    Returns:
        OrderInfo object with extracted data
    """
    parser = OrderConfirmationParser()
    
    # Extract HTML content from Gmail API payload
    html_content = ""
    if 'payload' in gmail_message:
        payload = gmail_message['payload']
        
        if 'parts' in payload:
            for part in payload['parts']:
                if part.get('mimeType') == 'text/html':
                    body_data = part.get('body', {}).get('data', '')
                    if body_data:
                        import base64
                        html_content = base64.urlsafe_b64decode(body_data).decode('utf-8', errors='ignore')
                        break
        elif payload.get('mimeType') == 'text/html':
            body_data = payload.get('body', {}).get('data', '')
            if body_data:
                import base64
                html_content = base64.urlsafe_b64decode(body_data).decode('utf-8', errors='ignore')
    
    order_info = parser._parse_html_content(html_content)
    
    # Extract metadata from Gmail API headers
    headers = gmail_message.get('payload', {}).get('headers', [])
    for header in headers:
        name = header.get('name', '').lower()
        value = header.get('value', '')
        
        if name == 'subject':
            order_info.email_subject = value
        elif name == 'from':
            order_info.sender = value
        elif name == 'date':
            order_info.email_date = value
    
    return order_info

# Example usage
if __name__ == "__main__":
    # Example: Parse a local email file
    # order_info = parse_order_email_file("order_confirmation.eml")
    # print(order_info.to_dict())
    
    # Example: Parse Gmail API message
    # gmail_message = {...}  # Gmail API response
    # order_info = parse_gmail_api_message(gmail_message)
    # print(order_info.to_dict())
    
    print("Order Confirmation Email Parser ready!")
    print("Supported merchants: StockX")
    print("Supported order types: Regular orders, Xpress orders")