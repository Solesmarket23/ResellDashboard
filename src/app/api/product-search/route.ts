import { NextRequest, NextResponse } from 'next/server';

interface ProductSearchResult {
  id: string;
  name: string;
  image: string;
  brand?: string;
  price?: string;
  source: string;
}

// Mock product database - in a real app, this would be a proper database
const MOCK_PRODUCTS: ProductSearchResult[] = [
  // Nike Products
  {
    id: '1',
    name: 'Nike Air Jordan 1 High OG Bred',
    image: 'https://images.stockx.com/images/Nike-Air-Jordan-1-Retro-High-OG-Bred-2016.jpg',
    brand: 'Nike',
    price: '$1,700',
    source: 'StockX'
  },
  {
    id: '2',
    name: 'Nike Air Jordan 1 High OG Chicago',
    image: 'https://images.stockx.com/images/Nike-Air-Jordan-1-Retro-High-OG-Chicago-2015.jpg',
    brand: 'Nike',
    price: '$2,000',
    source: 'StockX'
  },
  {
    id: '3',
    name: 'Nike Air Force 1 Low White',
    image: 'https://images.stockx.com/images/Nike-Air-Force-1-07-White.jpg',
    brand: 'Nike',
    price: '$90',
    source: 'StockX'
  },
  {
    id: '4',
    name: 'Nike Dunk Low Panda',
    image: 'https://images.stockx.com/images/Nike-Dunk-Low-Panda-2021.jpg',
    brand: 'Nike',
    price: '$100',
    source: 'StockX'
  },
  {
    id: '5',
    name: 'Nike Air Max 90 White Infrared',
    image: 'https://images.stockx.com/images/Nike-Air-Max-90-White-Infrared.jpg',
    brand: 'Nike',
    price: '$110',
    source: 'StockX'
  },
  {
    id: '6',
    name: 'Nike Blazer Mid 77 Vintage White',
    image: 'https://images.stockx.com/images/Nike-Blazer-Mid-77-Vintage-White.jpg',
    brand: 'Nike',
    price: '$85',
    source: 'StockX'
  },
  {
    id: '7',
    name: 'Nike Vapor Edge 360 Untouchable Mid',
    image: 'https://images.stockx.com/images/Nike-Vapor-Edge-360-Untouchable-Mid-White-Metallic-Silver.jpg',
    brand: 'Nike',
    price: '$120',
    source: 'StockX'
  },
  
  // Jordan Products
  {
    id: '8',
    name: 'Jordan 4 Retro Military Blue',
    image: 'https://images.stockx.com/images/Air-Jordan-4-Retro-Military-Blue-2024.jpg',
    brand: 'Jordan',
    price: '$200',
    source: 'StockX'
  },
  {
    id: '9',
    name: 'Jordan 1 Low White Black',
    image: 'https://images.stockx.com/images/Air-Jordan-1-Low-White-Black.jpg',
    brand: 'Jordan',
    price: '$120',
    source: 'StockX'
  },
  {
    id: '10',
    name: 'Jordan 3 Retro White Cement',
    image: 'https://images.stockx.com/images/Air-Jordan-3-Retro-White-Cement-2018.jpg',
    brand: 'Jordan',
    price: '$200',
    source: 'StockX'
  },
  
  // Adidas Products
  {
    id: '11',
    name: 'Adidas Yeezy Boost 350 V2 Cream White',
    image: 'https://images.stockx.com/images/adidas-Yeezy-Boost-350-V2-Cream-White.jpg',
    brand: 'Adidas',
    price: '$220',
    source: 'StockX'
  },
  {
    id: '12',
    name: 'Adidas Yeezy Slide Bone',
    image: 'https://images.stockx.com/images/adidas-Yeezy-Slide-Bone.jpg',
    brand: 'Adidas',
    price: '$60',
    source: 'StockX'
  },
  {
    id: '13',
    name: 'Adidas Yeezy Slide Dark Onyx',
    image: 'https://images.stockx.com/images/adidas-Yeezy-Slide-Dark-Onyx.jpg',
    brand: 'Adidas',
    price: '$60',
    source: 'StockX'
  },
  {
    id: '14',
    name: 'Adidas Yeezy Boost 350 V2 Zebra',
    image: 'https://images.stockx.com/images/adidas-Yeezy-Boost-350-V2-Zebra.jpg',
    brand: 'Adidas',
    price: '$300',
    source: 'StockX'
  },
  
  // Other Brands
  {
    id: '15',
    name: 'UGG Tasman Slipper Black',
    image: 'https://images.stockx.com/images/UGG-Tasman-Slipper-Black.jpg',
    brand: 'UGG',
    price: '$80',
    source: 'StockX'
  },
  {
    id: '16',
    name: 'UGG Tazz Slipper Chestnut',
    image: 'https://images.stockx.com/images/UGG-Tazz-Slipper-Chestnut.jpg',
    brand: 'UGG',
    price: '$70',
    source: 'StockX'
  },
  {
    id: '17',
    name: 'Yeezy Gap Engineered by Balenciaga Padded Denim Jacket',
    image: 'https://images.stockx.com/images/Yeezy-Gap-Engineered-by-Balenciaga-Padded-Denim-Jacket-Blue.jpg',
    brand: 'Yeezy Gap',
    price: '$400',
    source: 'StockX'
  },
  {
    id: '18',
    name: 'Pop Mart Labubu The Monsters Exciting Macaron',
    image: 'https://images.stockx.com/images/Pop-Mart-Labubu-The-Monsters-Exciting-Macaron-Green-Grape.jpg',
    brand: 'Pop Mart',
    price: '$25',
    source: 'StockX'
  }
];

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();

    if (!query || query.length < 2) {
      return NextResponse.json({ results: [] });
    }

    // Simple search logic - in a real app, you'd use a proper search engine
    const searchTerm = query.toLowerCase();
    const filteredProducts = MOCK_PRODUCTS.filter(product =>
      product.name.toLowerCase().includes(searchTerm) ||
      product.brand?.toLowerCase().includes(searchTerm)
    );

    // Limit results to 8 for better UX
    const results = filteredProducts.slice(0, 8);

    return NextResponse.json({ results });

  } catch (error) {
    console.error('Product search error:', error);
    return NextResponse.json(
      { error: 'Search failed' },
      { status: 500 }
    );
  }
}
