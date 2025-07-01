'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, HelpCircle, Search, MessageSquare, Mail, Phone } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';

const FAQ = () => {
  const { currentTheme } = useTheme();
  const [searchTerm, setSearchTerm] = useState('');
  const [openItems, setOpenItems] = useState<number[]>([]);
  
  // Dynamic theme detection for consistent neon styling
  const isNeon = currentTheme.name === 'Neon';

  const faqCategories = [
    {
      title: 'Getting Started',
      questions: [
        {
          question: 'What is FlipFlow and how does it help resellers?',
          answer: 'FlipFlow is a comprehensive analytics platform designed specifically for sneaker and streetwear resellers. It helps you track profits, monitor market trends, manage inventory, and optimize your reselling strategy through real-time data analytics, automated email scanning, and performance insights.'
        },
        {
          question: 'How do I set up my account and connect my email?',
          answer: 'Setting up FlipFlow is simple: 1) Create your account and choose a plan, 2) Connect your Gmail account for automatic purchase/sale scanning, 3) Import your existing data or start fresh, 4) Configure your marketplace preferences (StockX, GOAT, etc.), 5) Begin tracking your reselling journey with our automated tools.'
        },
        {
          question: 'Which marketplaces does FlipFlow support?',
          answer: 'FlipFlow supports all major reselling platforms including StockX, GOAT, eBay, Grailed, Depop, Facebook Marketplace, and more. Our email scanning technology automatically detects transactions from these platforms and categorizes them accordingly.'
        },
        {
          question: 'Is my data safe and secure with FlipFlow?',
          answer: 'Absolutely. We use enterprise-grade encryption, secure OAuth authentication for email access, and follow strict data privacy protocols. Your financial information is encrypted and stored securely, and we never share your data with third parties.'
        }
      ]
    },
    {
      title: 'Email Integration & Automation',
      questions: [
        {
          question: 'How does the Gmail integration work?',
          answer: 'Our Gmail integration uses secure OAuth authentication to scan your emails for purchase confirmations, shipping notifications, and sale receipts. The system automatically extracts relevant data like order numbers, prices, and product details without storing your actual emails.'
        },
        {
          question: 'What email patterns does FlipFlow recognize?',
          answer: 'FlipFlow recognizes emails from 50+ platforms including order confirmations, shipping notifications, payment receipts, and verification failure notices. Our AI continuously learns new patterns to ensure comprehensive coverage of your reselling activities.'
        },
        {
          question: 'Can I manually add transactions if they\'re not detected?',
          answer: 'Yes! You can manually add any purchases, sales, or expenses through our intuitive interface. Simply click "Record Sale" or "Add Purchase" and fill in the details. This is perfect for cash transactions or platforms we don\'t yet support.'
        },
        {
          question: 'How often does FlipFlow scan my emails?',
          answer: 'FlipFlow scans your emails in real-time for new transactions. Historical scans are performed when you first connect your account, and then the system monitors for new emails automatically. You can also trigger manual scans anytime.'
        }
      ]
    },
    {
      title: 'Analytics & Reporting',
      questions: [
        {
          question: 'What analytics does FlipFlow provide?',
          answer: 'FlipFlow offers comprehensive analytics including profit/loss tracking, ROI calculations, inventory turnover rates, market trend analysis, seasonal performance insights, tax-ready reports, and predictive analytics to help you make data-driven decisions.'
        },
        {
          question: 'How accurate are the profit calculations?',
          answer: 'Our profit calculations account for purchase price, selling price, marketplace fees, shipping costs, taxes, and any additional expenses you input. We maintain up-to-date fee structures for all major platforms to ensure accuracy within 1-2%.'
        },
        {
          question: 'Can I export my data for tax purposes?',
          answer: 'Yes! FlipFlow provides tax-ready reports that can be exported in CSV, PDF, or Excel formats. Our reports include all necessary information for Schedule C filing, including detailed transaction records, profit/loss statements, and expense tracking.'
        },
        {
          question: 'What is the difference between Monthly, Weekly, and Daily analytics?',
          answer: 'These timeframes allow you to analyze your performance at different granularities. Daily views show immediate trends and quick wins, Weekly views help identify patterns and optimize strategies, while Monthly views provide comprehensive performance analysis and long-term planning insights.'
        }
      ]
    },
    {
      title: 'Inventory & Tracking',
      questions: [
        {
          question: 'How does inventory tracking work?',
          answer: 'FlipFlow automatically tracks your inventory by monitoring purchase emails and sale confirmations. When you buy an item, it\'s added to inventory. When you sell it, it\'s removed and profit is calculated. You can also manually manage inventory for items purchased offline.'
        },
        {
          question: 'What is the Failed Verifications feature?',
          answer: 'Failed Verifications tracks items that didn\'t pass marketplace authentication (like StockX verification failures). This helps you identify problem suppliers, track return processes, and calculate the true cost of verification failures on your business.'
        },
        {
          question: 'Can I track items across multiple marketplaces?',
          answer: 'Absolutely! FlipFlow tracks the same item across different platforms, showing you price variations and helping you identify the best selling opportunities. Our system recognizes when the same product appears on multiple marketplaces.'
        },
        {
          question: 'How do I handle returns and refunds?',
          answer: 'FlipFlow automatically detects refund emails and adjusts your analytics accordingly. You can also manually process returns through the interface, which will update your profit calculations and inventory levels automatically.'
        }
      ]
    },
    {
      title: 'Pricing & Plans',
      questions: [
        {
          question: 'What pricing plans are available?',
          answer: 'We offer three plans: Starter ($19/month) for new resellers with basic analytics, Professional ($39/month) with advanced features and automation, and Enterprise ($79/month) with unlimited everything plus priority support. All plans include a 14-day free trial.'
        },
        {
          question: 'Is there a free trial?',
          answer: 'Yes! All plans come with a 14-day free trial with full access to all features. No credit card required to start your trial. You can cancel anytime during the trial period without any charges.'
        },
        {
          question: 'Can I upgrade or downgrade my plan?',
          answer: 'Yes, you can change your plan anytime. Upgrades take effect immediately, while downgrades take effect at the end of your current billing cycle. You\'ll be prorated for any plan changes.'
        },
        {
          question: 'What payment methods do you accept?',
          answer: 'We accept all major credit cards (Visa, MasterCard, American Express), PayPal, and bank transfers for annual plans. All payments are processed securely through Stripe with enterprise-grade encryption.'
        }
      ]
    },
    {
      title: 'Technical Support',
      questions: [
        {
          question: 'How do I get help if I have issues?',
          answer: 'We offer multiple support channels: 1) Live chat during business hours, 2) Email support with 24-hour response time, 3) Comprehensive documentation and video tutorials, 4) Community forum for user discussions, 5) Priority phone support for Enterprise customers.'
        },
        {
          question: 'What if FlipFlow doesn\'t recognize my marketplace?',
          answer: 'Contact our support team with examples of your transaction emails. We regularly add support for new marketplaces and can usually implement recognition patterns within 1-2 weeks. We prioritize requests based on user demand.'
        },
        {
          question: 'Can I integrate FlipFlow with other tools?',
          answer: 'Yes! FlipFlow offers integrations with popular tools like Google Sheets, QuickBooks, TaxJar, and Zapier. We also provide API access for custom integrations. Our roadmap includes direct integrations with major accounting software.'
        },
        {
          question: 'Is there a mobile app?',
          answer: 'FlipFlow is fully responsive and works great on mobile browsers. We\'re currently developing native iOS and Android apps with features like barcode scanning, quick profit calculations, and push notifications for important updates.'
        }
      ]
    }
  ];

  const filteredCategories = faqCategories.map(category => ({
    ...category,
    questions: category.questions.filter(
      q => 
        q.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
        q.answer.toLowerCase().includes(searchTerm.toLowerCase())
    )
  })).filter(category => category.questions.length > 0);

  const toggleItem = (categoryIndex: number, questionIndex: number) => {
    const itemId = categoryIndex * 1000 + questionIndex;
    setOpenItems(prev => 
      prev.includes(itemId) 
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  const isItemOpen = (categoryIndex: number, questionIndex: number) => {
    const itemId = categoryIndex * 1000 + questionIndex;
    return openItems.includes(itemId);
  };

  return (
    <div className={`flex-1 p-8 ${
      isNeon 
        ? 'bg-slate-950' 
        : currentTheme.colors.background
    }`}>
      {/* Header */}
      <div className="text-center mb-12">
        <div className="flex items-center justify-center mb-4">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${
            isNeon
              ? 'bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 border border-cyan-500/30'
              : 'bg-blue-100'
          }`}>
            <HelpCircle className={`w-8 h-8 ${
              isNeon ? 'text-cyan-400' : 'text-blue-600'
            }`} />
          </div>
        </div>
        <h1 className={`text-4xl font-bold mb-4 ${
          isNeon ? 'text-white' : 'text-gray-900'
        }`}>
          Frequently Asked Questions
        </h1>
        <p className={`text-xl max-w-3xl mx-auto ${
          isNeon ? 'text-slate-300' : 'text-gray-600'
        }`}>
          Find answers to common questions about FlipFlow, our features, and how to maximize your reselling success.
        </p>
      </div>

      {/* Search Bar */}
      <div className="max-w-2xl mx-auto mb-12">
        <div className="relative">
          <Search className={`w-5 h-5 absolute left-4 top-1/2 transform -translate-y-1/2 ${
            isNeon ? 'text-slate-400' : 'text-gray-400'
          }`} />
          <input
            type="text"
            placeholder="Search FAQ..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full pl-12 pr-6 py-4 rounded-xl text-lg focus:outline-none focus:ring-2 transition-all duration-300 ${
              isNeon
                ? 'input-premium text-white placeholder-slate-400 border-slate-600/50 focus:ring-cyan-500 focus:border-cyan-500'
                : 'bg-white border border-gray-300 focus:ring-blue-500 focus:border-blue-500'
            }`}
          />
        </div>
      </div>

      {/* FAQ Content */}
      <div className="max-w-4xl mx-auto">
        {filteredCategories.map((category, categoryIndex) => (
          <div key={categoryIndex} className="mb-12">
            <h2 className={`text-2xl font-bold mb-6 ${
              isNeon ? 'text-cyan-400' : 'text-gray-900'
            }`}>
              {category.title}
            </h2>
            
            <div className="space-y-4">
              {category.questions.map((faq, questionIndex) => {
                const isOpen = isItemOpen(categoryIndex, questionIndex);
                return (
                  <div
                    key={questionIndex}
                    className={`rounded-xl overflow-hidden transition-all duration-300 ${
                      isNeon
                        ? 'dark-neon-card border border-slate-700/50 hover:border-cyan-500/30'
                        : 'bg-white border border-gray-200 hover:border-gray-300 shadow-sm'
                    }`}
                  >
                    <button
                      onClick={() => toggleItem(categoryIndex, questionIndex)}
                      className={`w-full p-6 text-left transition-all duration-300 ${
                        isNeon
                          ? 'hover:bg-slate-800/50'
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <h3 className={`text-lg font-semibold pr-4 ${
                          isNeon ? 'text-white' : 'text-gray-900'
                        }`}>
                          {faq.question}
                        </h3>
                        <div className={`flex-shrink-0 transition-transform duration-300 ${
                          isOpen ? 'rotate-180' : ''
                        }`}>
                          <ChevronDown className={`w-5 h-5 ${
                            isNeon ? 'text-cyan-400' : 'text-gray-500'
                          }`} />
                        </div>
                      </div>
                    </button>
                    
                    {isOpen && (
                      <div className={`px-6 pb-6 ${
                        isNeon ? 'border-t border-slate-700/50' : 'border-t border-gray-100'
                      }`}>
                        <p className={`text-base leading-relaxed mt-4 ${
                          isNeon ? 'text-slate-300' : 'text-gray-600'
                        }`}>
                          {faq.answer}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Contact Support Section */}
      <div className={`max-w-4xl mx-auto mt-16 p-8 rounded-xl ${
        isNeon
          ? 'dark-neon-card border border-slate-700/50'
          : 'bg-white border border-gray-200 shadow-sm'
      }`}>
        <div className="text-center mb-8">
          <h2 className={`text-2xl font-bold mb-4 ${
            isNeon ? 'text-white' : 'text-gray-900'
          }`}>
            Still need help?
          </h2>
          <p className={`text-lg ${
            isNeon ? 'text-slate-300' : 'text-gray-600'
          }`}>
            Our support team is here to help you succeed with FlipFlow.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Live Chat */}
          <div className={`text-center p-6 rounded-lg ${
            isNeon
              ? 'bg-gradient-to-br from-cyan-500/10 to-emerald-500/10 border border-cyan-500/20'
              : 'bg-gray-50 border border-gray-200'
          }`}>
            <div className={`w-12 h-12 rounded-lg mx-auto mb-4 flex items-center justify-center ${
              isNeon
                ? 'bg-gradient-to-br from-cyan-500/20 to-emerald-500/20'
                : 'bg-blue-100'
            }`}>
              <MessageSquare className={`w-6 h-6 ${
                isNeon ? 'text-cyan-400' : 'text-blue-600'
              }`} />
            </div>
            <h3 className={`text-lg font-semibold mb-2 ${
              isNeon ? 'text-white' : 'text-gray-900'
            }`}>
              Live Chat
            </h3>
            <p className={`text-sm mb-4 ${
              isNeon ? 'text-slate-400' : 'text-gray-600'
            }`}>
              Get instant help during business hours
            </p>
            <button className={`w-full py-2 px-4 rounded-lg font-medium transition-all duration-300 ${
              isNeon
                ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 text-white hover:from-cyan-600 hover:to-emerald-600 shadow-lg shadow-cyan-500/25'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}>
              Start Chat
            </button>
          </div>

          {/* Email Support */}
          <div className={`text-center p-6 rounded-lg ${
            isNeon
              ? 'bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 border border-emerald-500/20'
              : 'bg-gray-50 border border-gray-200'
          }`}>
            <div className={`w-12 h-12 rounded-lg mx-auto mb-4 flex items-center justify-center ${
              isNeon
                ? 'bg-gradient-to-br from-emerald-500/20 to-cyan-500/20'
                : 'bg-green-100'
            }`}>
              <Mail className={`w-6 h-6 ${
                isNeon ? 'text-emerald-400' : 'text-green-600'
              }`} />
            </div>
            <h3 className={`text-lg font-semibold mb-2 ${
              isNeon ? 'text-white' : 'text-gray-900'
            }`}>
              Email Support
            </h3>
            <p className={`text-sm mb-4 ${
              isNeon ? 'text-slate-400' : 'text-gray-600'
            }`}>
              24-hour response time guaranteed
            </p>
            <button className={`w-full py-2 px-4 rounded-lg font-medium transition-all duration-300 ${
              isNeon
                ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-white hover:from-emerald-600 hover:to-cyan-600 shadow-lg shadow-emerald-500/25'
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}>
              Send Email
            </button>
          </div>

          {/* Phone Support */}
          <div className={`text-center p-6 rounded-lg ${
            isNeon
              ? 'bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20'
              : 'bg-gray-50 border border-gray-200'
          }`}>
            <div className={`w-12 h-12 rounded-lg mx-auto mb-4 flex items-center justify-center ${
              isNeon
                ? 'bg-gradient-to-br from-purple-500/20 to-pink-500/20'
                : 'bg-purple-100'
            }`}>
              <Phone className={`w-6 h-6 ${
                isNeon ? 'text-purple-400' : 'text-purple-600'
              }`} />
            </div>
            <h3 className={`text-lg font-semibold mb-2 ${
              isNeon ? 'text-white' : 'text-gray-900'
            }`}>
              Phone Support
            </h3>
            <p className={`text-sm mb-4 ${
              isNeon ? 'text-slate-400' : 'text-gray-600'
            }`}>
              Priority support for Enterprise customers
            </p>
            <button className={`w-full py-2 px-4 rounded-lg font-medium transition-all duration-300 ${
              isNeon
                ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600 shadow-lg shadow-purple-500/25'
                : 'bg-purple-600 text-white hover:bg-purple-700'
            }`}>
              Call Now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FAQ;