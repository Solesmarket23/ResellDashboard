'use client';

import { useState } from 'react';
import { ChevronDown, Edit, MoreHorizontal, ExternalLink } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';

const Purchases = () => {
  const [sortBy, setSortBy] = useState('Purchase Date');
  const { currentTheme } = useTheme();

  const purchases = [
    {
      id: 1,
      product: {
        name: "Travis Scott Cactus Jack x Spider Days Before Rode...",
        brand: "Travis Scott",
        size: "Size US XL",
        image: "https://picsum.photos/200/200?random=1",
        bgColor: "bg-amber-900",
        color: "brown"
      },
      orderNumber: "81-CE1Y398K3Z",
      status: "Delivered",
      statusColor: "green",
      tracking: "888637538408",
      market: "StockX",
      price: "$118.90",
      originalPrice: "$118.90 + $0.00",
      purchaseDate: "Jun 23",
      dateAdded: "Jun 23\n4:15 PM",
      verified: "verified",
      verifiedColor: "green"
    },
    {
      id: 2,
      product: {
        name: "Travis Scott Cactus Jack x Spider Days Before Rode...",
        brand: "Travis Scott",
        size: "Size US S",
        image: "https://picsum.photos/200/200?random=2",
        bgColor: "bg-amber-900",
        color: "brown"
      },
      orderNumber: "81-FC440HCNLH",
      status: "Ordered",
      statusColor: "orange",
      tracking: "888327774362",
      market: "StockX",
      price: "$165.11",
      originalPrice: "$165.11 + $0.00",
      purchaseDate: "Jun 23",
      dateAdded: "Jun 23\n4:15 PM",
      verified: "pending",
      verifiedColor: "orange"
    },
    {
      id: 3,
      product: {
        name: "Denim Tears Cotton Wreath Hoodie Black Monochro...",
        brand: "Denim Tears",
        size: "Size US S",
        image: "https://picsum.photos/200/200?random=3",
        bgColor: "bg-gray-900",
        color: "black"
      },
      orderNumber: "81-DHFSC2NK16",
      status: "Shipped",
      statusColor: "blue",
      tracking: "882268115454",
      market: "StockX",
      price: "$197.83",
      originalPrice: "$197.83 + $0.00",
      purchaseDate: "Jun 23",
      dateAdded: "Jun 23\n4:15 PM",
      verified: "pending",
      verifiedColor: "orange"
    },
    {
      id: 4,
      product: {
        name: "Denim Tears The Cotton Wreath Shorts Grey",
        brand: "Denim Tears",
        size: "Size US L",
        image: "https://picsum.photos/200/200?random=4",
        bgColor: "bg-gray-400",
        color: "gray"
      },
      orderNumber: "81-S88U6Q0NBP",
      status: "Shipped",
      statusColor: "blue",
      tracking: "882258186354",
      market: "StockX",
      price: "$222.39",
      originalPrice: "$222.39 + $0.00",
      purchaseDate: "Jun 23",
      dateAdded: "Jun 23\n4:15 PM",
      verified: "pending",
      verifiedColor: "orange"
    },
    {
      id: 5,
      product: {
        name: "Denim Tears The Cotton Wreath Sweatshirt Black",
        brand: "Denim Tears",
        size: "Size US M",
        image: "https://picsum.photos/200/200?random=5",
        bgColor: "bg-gray-900",
        color: "black"
      },
      orderNumber: "81-LG34U384ZP",
      status: "Delivered",
      statusColor: "green",
      tracking: "430386817447",
      market: "StockX",
      price: "$238.13",
      originalPrice: "$238.13 + $0.00",
      purchaseDate: "Jun 23",
      dateAdded: "Jun 23\n4:15 PM",
      verified: "pending",
      verifiedColor: "orange"
    },
    {
      id: 6,
      product: {
        name: "Denim Tears The Cotton Wreath Sweatshirt Royal Blue",
        brand: "Denim Tears",
        size: "Size US S",
        image: "https://picsum.photos/200/200?random=6",
        bgColor: "bg-blue-600",
        color: "blue"
      },
      orderNumber: "81-B8BM19830M",
      status: "Ordered",
      statusColor: "orange",
      tracking: "881697844256",
      market: "StockX",
      price: "$230.99",
      originalPrice: "$230.99 + $0.00",
      purchaseDate: "Jun 23",
      dateAdded: "Jun 23\n4:15 PM",
      verified: "pending",
      verifiedColor: "orange"
    },
    {
      id: 7,
      product: {
        name: "Denim Tears The Cotton Wreath Sweatshirt Grey",
        brand: "Denim Tears",
        size: "Size US M",
        image: "https://picsum.photos/200/200?random=7",
        bgColor: "bg-gray-500",
        color: "gray"
      },
      orderNumber: "81-EBN0136AHN",
      status: "Ordered",
      statusColor: "orange",
      tracking: "881913545073",
      market: "StockX",
      price: "$207.78",
      originalPrice: "$207.78 + $0.00",
      purchaseDate: "Jun 23",
      dateAdded: "Jun 23\n4:15 PM",
      verified: "pending",
      verifiedColor: "orange"
    },
    {
      id: 8,
      product: {
        name: "Denim Tears The Cotton Wreath Sweatshirt Grey",
        brand: "Denim Tears",
        size: "Size US S",
        image: "https://picsum.photos/200/200?random=8",
        bgColor: "bg-gray-500",
        color: "gray"
      },
      orderNumber: "81-Y17HK445F7",
      status: "Ordered",
      statusColor: "orange",
      tracking: "882071931655",
      market: "StockX",
      price: "$212.02",
      originalPrice: "$212.02 + $0.00",
      purchaseDate: "Jun 23",
      dateAdded: "Jun 23\n4:15 PM",
      verified: "pending",
      verifiedColor: "orange"
    }
  ];

  const getStatusBadge = (status: string, color: string) => {
    const baseClasses = "px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap";
    const colorClasses = {
      green: "bg-green-100 text-green-800",
      orange: "bg-orange-100 text-orange-800",
      blue: "bg-blue-100 text-blue-800"
    };
    return `${baseClasses} ${colorClasses[color as keyof typeof colorClasses]}`;
  };

  const getVerifiedIndicator = (verified: string, color: string) => {
    const colorClasses = {
      green: "bg-green-500",
      orange: "bg-orange-500",
      red: "bg-red-500"
    };
    return `w-2 h-2 rounded-full ${colorClasses[color as keyof typeof colorClasses]}`;
  };

  return (
    <div className={`flex-1 ${currentTheme.colors.background} p-8`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Purchases</h1>
          <p className="text-gray-600 mt-1">Showing 468 of 468 purchases</p>
        </div>
        <div className="text-right">
          <p className="text-gray-600">Total value:</p>
          <p className="text-xl font-bold text-gray-900">$89510.63</p>
        </div>
      </div>

      {/* Table */}
      <div className={`${currentTheme.colors.cardBackground} rounded-lg shadow-sm border border-gray-200 overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="h-10">
                <th className="px-6 py-0 h-10 align-middle text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Product
                </th>
                <th className="px-6 py-0 h-10 align-middle text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Order #
                </th>
                <th className="px-6 py-0 h-10 align-middle text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status / Delivery
                </th>
                <th className="px-6 py-0 h-10 align-middle text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tracking
                </th>
                <th className="px-6 py-0 h-10 align-middle text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Market
                </th>
                <th className="px-6 py-0 h-10 align-middle text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Price
                </th>
                <th className="px-6 py-0 h-10 align-middle text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                  <div className="flex items-center h-10">
                    Purchase Date
                    <ChevronDown className="w-4 h-4 ml-1" />
                  </div>
                </th>
                <th className="px-6 py-0 h-10 align-middle text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date Added
                </th>
                <th className="px-6 py-0 h-10 align-middle text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Verified
                </th>
                <th className="px-6 py-0 h-10 align-middle text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Edit
                </th>
              </tr>
            </thead>
            <tbody className={`${currentTheme.colors.cardBackground} divide-y divide-gray-100`}>
              {purchases.map((purchase) => (
                <tr key={purchase.id} className="hover:bg-gray-50 transition-colors h-12">
                  <td className="px-6 py-0">
                    <div className="flex items-center h-12">
                      <div className={`w-8 h-8 rounded-lg mr-3 flex-shrink-0 overflow-hidden ${purchase.product.bgColor} flex items-center justify-center shadow-sm`}>
                        <img 
                          src={purchase.product.image} 
                          alt={purchase.product.name}
                          className="w-full h-full object-cover rounded-lg"
                          onLoad={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.parentElement!.classList.remove(purchase.product.bgColor);
                          }}
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            const parent = target.parentElement!;
                            parent.innerHTML = `<div class="w-full h-full flex items-center justify-center text-white text-xs font-bold">${purchase.product.brand.split(' ')[0]}</div>`;
                          }}
                        />
                      </div>
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {purchase.product.name}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {purchase.product.brand} • {purchase.product.size}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-0 h-12 align-middle">
                    <a 
                      href={`https://mail.google.com/mail/u/0/#search/"${encodeURIComponent(purchase.orderNumber)}"`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${currentTheme.colors.accent} ${currentTheme.colors.primaryHover.replace('hover:bg-', 'hover:')} text-sm font-medium hover:underline whitespace-nowrap`}
                    >
                      {purchase.orderNumber}
                    </a>
                  </td>
                  <td className="px-6 py-0 h-12 align-middle">
                    <span className={getStatusBadge(purchase.status, purchase.statusColor)}>
                      {purchase.status}
                    </span>
                  </td>
                  <td className="px-6 py-0 h-12 align-middle">
                    <a href="#" className={`${currentTheme.colors.accent} ${currentTheme.colors.primaryHover.replace('hover:bg-', 'hover:')} text-sm hover:underline`}>
                      {purchase.tracking}
                    </a>
                  </td>
                  <td className="px-6 py-0 h-12 align-middle text-sm text-gray-900 font-medium">
                    {purchase.market}
                  </td>
                  <td className="px-6 py-0 h-12 align-middle">
                    <div className="text-sm font-semibold text-gray-900">
                      {purchase.price}
                      <span className="text-xs text-gray-500 font-normal ml-1">({purchase.originalPrice})</span>
                    </div>
                  </td>
                  <td className="px-6 py-0 h-12 align-middle text-sm text-gray-900 font-medium">
                    {purchase.purchaseDate}
                  </td>
                  <td className="px-6 py-0 h-12 align-middle">
                    <div className="text-sm text-gray-900 whitespace-nowrap">
                      {purchase.dateAdded.replace('\n', ' ')}
                    </div>
                  </td>
                  <td className="px-6 py-0 h-12 align-middle">
                    <div className={getVerifiedIndicator(purchase.verified, purchase.verifiedColor)}></div>
                  </td>
                  <td className="px-6 py-0 h-12 align-middle">
                    <div className="flex items-center space-x-1">
                      <button className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors">
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Purchases; 