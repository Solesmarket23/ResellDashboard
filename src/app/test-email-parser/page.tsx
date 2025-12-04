"use client";

import { useState } from "react";

interface OrderInfo {
  merchant: string;
  order_number: string;
  order_type: string;
  product_name: string;
  product_variant: string;
  size: string;
  condition: string;
  style_id: string;
  product_image_url: string;
  product_image_alt: string;
  purchase_price: number;
  processing_fee: number;
  shipping_fee: number;
  shipping_type: string;
  total_amount: number;
  currency: string;
  estimated_delivery_start: string;
  estimated_delivery_end: string;
  purchase_date: string;
  tracking_number: string;
  carrier: string;
  shipping_status: string;
  email_subject: string;
  email_date: string;
  sender: string;
}

interface TestResult {
  filename: string;
  success: boolean;
  error?: string;
  data?: OrderInfo;
}

export default function TestEmailParserPage() {
  const [results, setResults] = useState<TestResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [emailFiles, setEmailFiles] = useState<File[]>([]);

  const runTests = async () => {
    setLoading(true);
    setResults([]);
    
    try {
      // Try to fetch from API first (works if files exist locally)
      const response = await fetch("/api/test-email-parser");
      const data = await response.json();
      
      // If we have results, use them
      if (data.results && data.results.length > 0) {
        // Check if any failed due to missing files
        const hasMissingFiles = data.results.some((r: TestResult) => 
          r.error?.includes('not found') || r.error?.includes('Email file not found')
        );
        
        if (!hasMissingFiles) {
          setResults(data.results);
          setLoading(false);
          return;
        }
      }
      
      // If files are missing or we have uploaded files, process them
      if (emailFiles.length > 0) {
        const fileResults: TestResult[] = [];
        
        for (const file of emailFiles) {
          try {
            const content = await file.text();
            const response = await fetch("/api/test-email-parser", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                emailContent: content,
                filename: file.name
              })
            });
            
            const result = await response.json();
            fileResults.push(result);
          } catch (error) {
            fileResults.push({
              filename: file.name,
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
        
        setResults(fileResults);
      } else {
        // Show message that files need to be uploaded
        setResults([{
          filename: "No files",
          success: false,
          error: "Please upload email files or ensure sample-emails directory exists locally"
        }]);
      }
    } catch (error) {
      console.error("Test failed:", error);
      setResults([{
        filename: "Error",
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    setEmailFiles(files);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ordered": return "bg-blue-100 text-blue-800";
      case "shipped": return "bg-yellow-100 text-yellow-800";
      case "delivered": return "bg-green-100 text-green-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getOrderTypeColor = (type: string) => {
    return type === "xpress" ? "bg-purple-100 text-purple-800" : "bg-gray-100 text-gray-800";
  };

  return (
    <div className="bg-gray-900 min-h-screen">
      <div className="max-w-7xl mx-auto p-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">
            Email Parser Test
          </h1>
          <p className="text-gray-400 mb-4 text-sm">
            Testing <strong className="text-green-400">OrderConfirmationParser</strong> with StockX emails
          </p>
          
          {/* Compact Instructions */}
          <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg p-3 mb-4 text-xs">
            <p className="text-gray-300 mb-1">
              <strong>Quick Start:</strong> Upload 1-2 .eml files from <code className="bg-gray-800 px-1 rounded">sample-emails</code> folder, then click "Test"
            </p>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Upload Email Files (.eml) - Select all 8 files
              </label>
              <input
                type="file"
                multiple
                accept=".eml"
                onChange={handleFileUpload}
                className="block w-full text-sm text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
              />
              {emailFiles.length > 0 && (
                <div className="mt-2">
                  <p className="text-sm text-gray-400 mb-2">
                    {emailFiles.length} file(s) selected:
                  </p>
                  <ul className="text-xs text-gray-500 space-y-1 max-h-32 overflow-y-auto">
                    {emailFiles.map((file, idx) => (
                      <li key={idx}>• {file.name}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <button
              onClick={runTests}
              disabled={loading}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors w-full"
            >
              {loading ? "Running Tests..." : emailFiles.length > 0 ? `Test ${emailFiles.length} File(s)` : "Run Tests (Local Files)"}
            </button>
          </div>
        </div>

        {results.length > 0 && (
          <div className="space-y-6">
            {/* Summary */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-semibold mb-4 text-gray-900">Summary</h2>
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600">
                    {results.filter(r => r.success).length}
                  </div>
                  <div className="text-sm text-gray-600">Successful</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-red-600">
                    {results.filter(r => !r.success).length}
                  </div>
                  <div className="text-sm text-gray-600">Failed</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600">
                    {results.filter(r => r.success && r.data?.order_number).length}
                  </div>
                  <div className="text-sm text-gray-600">With Order #</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-purple-600">
                    {results.filter(r => r.success && r.data?.size).length}
                  </div>
                  <div className="text-sm text-gray-600">With Size</div>
                </div>
              </div>
            </div>

            {/* Results Table */}
            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Email
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Order #
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Product
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Size
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Style ID
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Total
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Tracking
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {results.map((result, index) => (
                      <tr key={index} className={result.success ? "" : "bg-red-50"}>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                          {result.filename}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {result.success ? (
                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(result.data?.shipping_status || "")}`}>
                              {result.data?.shipping_status || "N/A"}
                            </span>
                          ) : (
                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                              Error
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {result.data?.order_number ? (
                            <span className="font-mono text-xs">{result.data.order_number}</span>
                          ) : result.success ? (
                            <span className="text-yellow-600 text-xs" title="Parser ran but no order number found">No data</span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {result.data?.order_type ? (
                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getOrderTypeColor(result.data.order_type)}`}>
                              {result.data.order_type}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 max-w-xs truncate">
                          {result.data?.product_name || (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {result.data?.size ? (
                            <span>{result.data.size}</span>
                          ) : result.success ? (
                            <span className="text-yellow-600 text-xs" title="Parser ran but no size found">No data</span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {result.data?.style_id || (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {result.data?.total_amount ? (
                            `$${result.data.total_amount.toFixed(2)}`
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {result.data?.tracking_number ? (
                            <span className="font-mono text-xs">
                              {result.data.tracking_number}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          <button
                            onClick={() => setSelectedEmail(selectedEmail === result.filename ? null : result.filename)}
                            className="text-blue-600 hover:text-blue-800 font-medium"
                          >
                            {selectedEmail === result.filename ? "Hide" : "Details"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Detailed View */}
            {selectedEmail && (
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h2 className="text-xl font-semibold mb-4 text-gray-900">
                  Details: {selectedEmail}
                </h2>
                {(() => {
                  const result = results.find(r => r.filename === selectedEmail);
                  if (!result) return null;
                  
                  if (!result.success) {
                    return (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <p className="text-red-800 font-medium">Error:</p>
                        <p className="text-red-600 mt-2 font-mono text-xs">{result.error}</p>
                      </div>
                    );
                  }
                  
                  // Show warning if parser ran but extracted no data
                  const hasData = result.data && (
                    result.data.order_number || 
                    result.data.size || 
                    result.data.product_name ||
                    result.data.total_amount
                  );
                  
                  if (!hasData) {
                    return (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                        <p className="text-yellow-800 font-medium">⚠️ Parser ran successfully but extracted no data</p>
                        <p className="text-yellow-600 mt-2 text-sm">
                          Check browser console (F12) or server logs for debug information.
                        </p>
                        <p className="text-yellow-600 mt-1 text-xs font-mono">
                          HTML extraction may have failed. Check if HTML was properly decoded from quoted-printable encoding.
                        </p>
                      </div>
                    );
                  }

                  const data = result.data!;
                  return (
                    <div className="space-y-6">
                      {/* Basic Info */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <h3 className="font-semibold text-gray-700 mb-2">Order Information</h3>
                          <dl className="space-y-2 text-sm">
                            <div className="flex">
                              <dt className="font-medium text-gray-600 w-32">Order Number:</dt>
                              <dd className="text-gray-900">{data.order_number || "—"}</dd>
                            </div>
                            <div className="flex">
                              <dt className="font-medium text-gray-600 w-32">Order Type:</dt>
                              <dd className="text-gray-900">{data.order_type || "—"}</dd>
                            </div>
                            <div className="flex">
                              <dt className="font-medium text-gray-600 w-32">Status:</dt>
                              <dd className="text-gray-900">{data.shipping_status || "—"}</dd>
                            </div>
                            <div className="flex">
                              <dt className="font-medium text-gray-600 w-32">Merchant:</dt>
                              <dd className="text-gray-900">{data.merchant || "—"}</dd>
                            </div>
                          </dl>
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-700 mb-2">Product Information</h3>
                          <dl className="space-y-2 text-sm">
                            <div className="flex">
                              <dt className="font-medium text-gray-600 w-32">Product Name:</dt>
                              <dd className="text-gray-900">{data.product_name || "—"}</dd>
                            </div>
                            <div className="flex">
                              <dt className="font-medium text-gray-600 w-32">Variant:</dt>
                              <dd className="text-gray-900">{data.product_variant || "—"}</dd>
                            </div>
                            <div className="flex">
                              <dt className="font-medium text-gray-600 w-32">Size:</dt>
                              <dd className="text-gray-900">{data.size || "—"}</dd>
                            </div>
                            <div className="flex">
                              <dt className="font-medium text-gray-600 w-32">Condition:</dt>
                              <dd className="text-gray-900">{data.condition || "—"}</dd>
                            </div>
                            <div className="flex">
                              <dt className="font-medium text-gray-600 w-32">Style ID:</dt>
                              <dd className="text-gray-900 font-mono">{data.style_id || "—"}</dd>
                            </div>
                          </dl>
                        </div>
                      </div>

                      {/* Pricing */}
                      <div>
                        <h3 className="font-semibold text-gray-700 mb-2">Pricing</h3>
                        <dl className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <dt className="font-medium text-gray-600">Purchase Price:</dt>
                            <dd className="text-gray-900">${data.purchase_price?.toFixed(2) || "0.00"}</dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="font-medium text-gray-600">Processing Fee:</dt>
                            <dd className="text-gray-900">${data.processing_fee?.toFixed(2) || "0.00"}</dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="font-medium text-gray-600">Shipping ({data.shipping_type || "Standard"}):</dt>
                            <dd className="text-gray-900">${data.shipping_fee?.toFixed(2) || "0.00"}</dd>
                          </div>
                          <div className="flex justify-between border-t pt-2 font-semibold">
                            <dt className="text-gray-900">Total:</dt>
                            <dd className="text-gray-900">${data.total_amount?.toFixed(2) || "0.00"}</dd>
                          </div>
                        </dl>
                      </div>

                      {/* Shipping */}
                      {data.tracking_number && (
                        <div>
                          <h3 className="font-semibold text-gray-700 mb-2">Shipping Information</h3>
                          <dl className="space-y-2 text-sm">
                            <div className="flex">
                              <dt className="font-medium text-gray-600 w-32">Tracking Number:</dt>
                              <dd className="text-gray-900 font-mono">{data.tracking_number}</dd>
                            </div>
                            <div className="flex">
                              <dt className="font-medium text-gray-600 w-32">Carrier:</dt>
                              <dd className="text-gray-900">{data.carrier || "—"}</dd>
                            </div>
                            {data.estimated_delivery_start && (
                              <div className="flex">
                                <dt className="font-medium text-gray-600 w-32">Est. Delivery:</dt>
                                <dd className="text-gray-900">
                                  {data.estimated_delivery_start}
                                  {data.estimated_delivery_end && ` - ${data.estimated_delivery_end}`}
                                </dd>
                              </div>
                            )}
                          </dl>
                        </div>
                      )}

                      {/* Email Metadata */}
                      <div>
                        <h3 className="font-semibold text-gray-700 mb-2">Email Metadata</h3>
                        <dl className="space-y-2 text-sm">
                          <div className="flex">
                            <dt className="font-medium text-gray-600 w-32">Subject:</dt>
                            <dd className="text-gray-900">{data.email_subject || "—"}</dd>
                          </div>
                          <div className="flex">
                            <dt className="font-medium text-gray-600 w-32">From:</dt>
                            <dd className="text-gray-900">{data.sender || "—"}</dd>
                          </div>
                          <div className="flex">
                            <dt className="font-medium text-gray-600 w-32">Date:</dt>
                            <dd className="text-gray-900">{data.email_date || "—"}</dd>
                          </div>
                        </dl>
                      </div>

                      {/* Product Image */}
                      {data.product_image_url && (
                        <div>
                          <h3 className="font-semibold text-gray-700 mb-2">Product Image</h3>
                          <img
                            src={data.product_image_url}
                            alt={data.product_image_alt || "Product"}
                            className="max-w-xs rounded-lg shadow-md"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

