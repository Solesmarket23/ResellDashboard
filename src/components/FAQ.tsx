'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Search, Mail, Shield, DollarSign, BarChart3, Package, CreditCard, Bell, HelpCircle, Sparkles } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';

const FAQ = () => {
  const { currentTheme, setTheme } = useTheme();
  const [searchTerm, setSearchTerm] = useState('');
  const [openItems, setOpenItems] = useState<number[]>([]);

  const toggleItem = (index: number) => {
    setOpenItems(current => 
      current.includes(index) 
        ? current.filter(i => i !== index)
        : [...current, index]
    );
  };

  const isLight = currentTheme.name === 'Light';
  const isNeon = currentTheme.name === 'Neon';

  const faqData = [
    {
      category: 'Getting Started',
      icon: Package,
      color: isLight ? 'from-blue-500 to-blue-600' : 'from-emerald-500 to-cyan-500',
      items: [
        {
          question: 'What is Flip Flow and how does it work?',
          answer: 'Flip Flow is a comprehensive resell intelligence platform designed for sneaker and streetwear resellers. It automatically tracks your purchases through Gmail integration, monitors inventory, calculates profits, and provides market insights to help you make better business decisions. Simply connect your Gmail account and let our AI parse your purchase confirmations and shipping notifications.'
        },
        {
          question: 'How do I get started with Flip Flow?',
          answer: 'Getting started is easy! First, sign up for an account and choose your plan. Then connect your Gmail account to automatically import your purchase data. Our system will scan your emails for order confirmations and shipping notifications from major resell platforms like StockX, GOAT, and others. You can also manually add purchases if needed.'
        },
        {
          question: 'Which platforms does Flip Flow support?',
          answer: 'Flip Flow supports all major resell platforms including StockX, GOAT, Flight Club, Stadium Goods, eBay, Grailed, and many more. Our AI email parsing system is constantly updated to recognize new platforms and email formats. If you use a platform we don\'t support yet, our system will learn from your data.'
        }
      ]
    },
    {
      category: 'Email Integration',
      icon: Mail,
      color: isNeon ? 'from-cyan-500 to-emerald-500' : 'from-green-500 to-green-600',
      items: [
        {
          question: 'Is it safe to connect my Gmail account?',
          answer: 'Absolutely! We use Google\'s official OAuth 2.0 authentication system, which means we never see your password. You can revoke access at any time through your Google account settings. We only read emails related to your purchases and never access personal emails or send emails on your behalf.'
        },
        {
                  question: 'What email data does Flip Flow access?',
        answer: 'Flip Flow only accesses emails that match specific patterns for purchase confirmations, shipping notifications, and delivery updates from known resell platforms. We use advanced AI to extract relevant information like order numbers, product names, prices, and tracking numbers while ignoring all other emails.'
        },
        {
          question: 'Why are some of my purchases not showing up?',
          answer: 'This can happen for several reasons: the email might be from a platform we haven\'t encountered yet, the email format might be unusual, or the email might be in a different folder. You can manually add missing purchases, and our system will learn from the data to improve future parsing.'
        }
      ]
    },
    {
      category: 'Tracking & Analytics',
      icon: BarChart3,
      color: isNeon ? 'from-cyan-400 to-purple-500' : 'from-purple-500 to-purple-600',
      items: [
        {
          question: 'How accurate is the profit calculation?',
          answer: 'Our profit calculations are highly accurate and include purchase price, fees, shipping costs, and taxes when available. We automatically factor in platform fees for major marketplaces. You can also manually adjust any values to ensure accuracy for your specific situation.'
        },
        {
          question: 'Can I track inventory that hasn\'t sold yet?',
          answer: 'Yes! Flip Flow tracks all your purchases regardless of sale status. Unsold items appear in your inventory with current market values, helping you decide when to sell or hold. We provide real-time market data and price trends for informed decision-making.'
        },
        {
          question: 'How do you determine current market values?',
          answer: 'We aggregate data from multiple sources including StockX, GOAT, eBay sold listings, and other major platforms to provide accurate market valuations. Our algorithms account for size, condition, and recent sales trends to give you the most current market value.'
        }
      ]
    },
    {
      category: 'Billing & Plans',
      icon: CreditCard,
      color: isNeon ? 'from-emerald-500 to-cyan-400' : 'from-orange-500 to-orange-600',
      items: [
        {
          question: 'What\'s included in the free trial?',
          answer: 'Our free trial gives you full access to all features for 14 days, including unlimited email parsing, inventory tracking, profit calculations, and market insights. No credit card required to start. After the trial, you can choose the plan that best fits your needs.'
        },
        {
          question: 'Can I change my plan anytime?',
          answer: 'Yes! You can upgrade or downgrade your plan at any time. When upgrading, you\'ll get immediate access to new features. When downgrading, changes take effect at your next billing cycle. We also offer annual billing with significant savings.'
        },
        {
          question: 'Do you offer refunds?',
          answer: 'We offer a 30-day money-back guarantee for all paid plans. If you\'re not satisfied with Flip Flow for any reason, contact our support team for a full refund. We believe in our product and want you to be completely satisfied.'
        }
      ]
    },
    {
      category: 'Security & Privacy',
      icon: Shield,
      color: isNeon ? 'from-cyan-500 to-emerald-600' : 'from-red-500 to-red-600',
      items: [
        {
          question: 'How is my data protected?',
          answer: 'We take security seriously. All data is encrypted in transit and at rest using industry-standard encryption. We\'re SOC 2 compliant and regularly undergo security audits. Your purchase data is stored securely and never shared with third parties without your explicit consent.'
        },
        {
          question: 'Can I export my data?',
          answer: 'Yes! You can export all your data at any time in CSV or JSON format. This includes your purchase history, sales data, and profit calculations. We believe your data belongs to you and should always be accessible.'
        },
        {
          question: 'What happens if I cancel my subscription?',
          answer: 'If you cancel, you\'ll retain access to all features until the end of your current billing period. After that, your account will be downgraded to our free tier with limited features. Your data is preserved and you can reactivate anytime to regain full access.'
        }
      ]
    },
    {
      category: 'Features & Tools',
      icon: DollarSign,
      color: isNeon ? 'from-emerald-400 to-cyan-500' : 'from-teal-500 to-teal-600',
      items: [
        {
          question: 'What is the Flip Finder tool?',
          answer: 'Flip Finder is our AI-powered tool that identifies profitable opportunities by analyzing market trends, price histories, and inventory levels across platforms. It helps you discover undervalued items and predict which sneakers are likely to increase in value.'
        },
        {
          question: 'How do price alerts work?',
          answer: 'Price alerts notify you when items in your watchlist hit target prices, when market values change significantly, or when profitable opportunities arise. You can set custom alerts for specific shoes, brands, or market conditions via email, SMS, or in-app notifications.'
        },
        {
          question: 'Can I track expenses beyond just purchase prices?',
          answer: 'Absolutely! You can track additional expenses like storage costs, cleaning supplies, photography equipment, and any other business-related expenses. This gives you a complete picture of your profitability and helps with tax preparation.'
        }
      ]
    }
  ];

  const filteredFAQ = faqData.map(category => ({
    ...category,
    items: category.items.filter(item => 
      item.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.answer.toLowerCase().includes(searchTerm.toLowerCase())
    )
  })).filter(category => category.items.length > 0);

  return (
    <div className={`flex-1 overflow-y-auto ${
      isNeon
        ? 'ml-80 bg-gray-900'
        : isLight
          ? 'ml-80 bg-gray-50'
    }`}>
      <div className="max-w-4xl mx-auto p-8">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center mb-4">
            <div className={`
              w-16 h-16 rounded-2xl flex items-center justify-center
              ${isNeon
                ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 glow-emerald'
                : 'bg-gradient-to-r from-blue-500 to-blue-600'
              }
            `}>
              <HelpCircle className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className={`
            text-4xl font-bold mb-4
            ${isNeon
              ? 'text-emerald-gradient'
              : 'text-gray-900'
            }
          `}>
            Frequently Asked Questions
          </h1>
          <p className={`
            text-xl max-w-2xl mx-auto
            ${isNeon
              ? 'text-slate-300'
              : 'text-gray-600'
            }
          `}>
            Find answers to common questions about Flip Flow. Can't find what you're looking for? 
            <a 
              href="mailto:support@flipflow.com" 
              className={`
                ml-1 transition-colors
                ${isNeon
                  ? 'text-emerald-400 hover:text-emerald-300'
                  : 'text-blue-600 hover:text-blue-800'
                }
              `}
            >
              Contact our support team
            </a>
          </p>
        </div>

        {/* Search */}
        <div className="relative mb-8">
          <Search className={`
            absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5
            ${isNeon ? 'text-slate-400' : 'text-gray-400'}
          `} />
          <input
            type="text"
            placeholder="Search FAQ..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`
              w-full pl-12 pr-4 py-3 rounded-lg font-medium transition-all duration-200 focus:outline-none focus:ring-2
              ${isNeon
                ? 'input-emerald'
                : 'bg-white border-2 border-gray-200 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500'
              }
            `}
          />
        </div>

        {/* FAQ Categories */}
        <div className="space-y-8">
          {filteredFAQ.map((category, categoryIndex) => (
            <div 
              key={categoryIndex} 
              className={`
                overflow-hidden rounded-xl shadow-lg transition-all duration-200
                ${isNeon
                  ? 'dark-emerald-card'
                  : 'bg-white border border-gray-200'
                }
              `}
            >
              <div className={`
                p-6 border-b
                ${isNeon
                  ? 'bg-slate-800 border-slate-600'
                  : 'bg-gray-50 border-gray-200'
                }
              `}>
                <div className="flex items-center">
                  <div className={`w-10 h-10 rounded-lg bg-gradient-to-r ${category.color} flex items-center justify-center mr-4`}>
                    <category.icon className="w-5 h-5 text-white" />
                  </div>
                  <h2 className={`
                    text-xl font-semibold
                    ${isNeon ? 'text-white' : 'text-gray-900'}
                  `}>
                    {category.category}
                  </h2>
                  <div className={`
                    ml-auto px-3 py-1 rounded-full text-sm font-medium
                    ${isNeon
                      ? 'badge-emerald'
                      : 'bg-blue-100 text-blue-800'
                    }
                  `}>
                    {category.items.length} Questions
                  </div>
                </div>
              </div>
              
              <div className={`
                ${isNeon
                  ? 'divide-y divide-slate-700'
                  : 'divide-y divide-gray-200'
                }
              `}>
                {category.items.map((item, itemIndex) => {
                  const globalIndex = categoryIndex * 100 + itemIndex;
                  const isOpen = openItems.includes(globalIndex);
                  
                  return (
                    <div key={itemIndex}>
                      <button
                        onClick={() => toggleItem(globalIndex)}
                        className={`
                          w-full px-6 py-4 text-left transition-colors group
                          ${isNeon
                            ? 'hover:bg-slate-800/50'
                            : 'hover:bg-gray-50'
                          }
                        `}
                      >
                        <div className="flex items-center justify-between">
                          <h3 className={`
                            text-lg font-medium pr-4 transition-colors
                            ${isNeon
                              ? 'text-white group-hover:text-emerald-300'
                              : 'text-gray-900 group-hover:text-blue-600'
                            }
                          `}>
                            {item.question}
                          </h3>
                          <ChevronDown className={`
                            w-4 h-4 transition-transform
                            ${isOpen ? 'rotate-180' : ''}
                          `} />
                        </div>
                      </button>
                      {isOpen && (
                        <div className="px-6 py-4">
                          {item.answer}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default FAQ;