'use client';

import { useState } from 'react';
import { 
  Zap, 
  Plus, 
  ChevronUp, 
  MessageSquare, 
  Calendar,
  CheckCircle,
  Clock,
  Eye,
  X,
  Send,
  Search,
  Tag,
  TrendingUp,
  List,
  LayoutDashboard
} from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';

interface Comment {
  id: number;
  author: string;
  authorAvatar: string;
  content: string;
  createdAt: string;
}

interface FeatureRequest {
  id: number;
  title: string;
  description: string;
  author: string;
  authorAvatar: string;
  category: string;
  status: 'in-review' | 'in-progress' | 'completed';
  votes: number;
  hasUserVoted: boolean;
  createdAt: string;
  comments: Comment[];
  priority: 'low' | 'medium' | 'high';
}

const FeatureRequests = () => {
  const { currentTheme } = useTheme();
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('votes');
  const [viewMode, setViewMode] = useState<'list' | 'pipeline'>('list');
  const [showComments, setShowComments] = useState<number | null>(null);
  const [newComment, setNewComment] = useState('');
  const [newRequest, setNewRequest] = useState({
    title: '',
    description: '',
    category: 'feature'
  });
  
  // Dynamic theme detection for consistent neon styling
  const isNeon = currentTheme.name === 'Neon';
  
  // Sample feature requests data
  const [requests, setRequests] = useState<FeatureRequest[]>([
    {
      id: 1,
      title: 'Dark Mode for Mobile App',
      description: 'Add a dark mode option to the mobile app for better viewing in low light conditions and battery savings.',
      author: 'Sarah Chen',
      authorAvatar: 'SC',
      category: 'mobile',
      status: 'in-progress',
      votes: 47,
      hasUserVoted: true,
      createdAt: '2024-01-15',
      comments: [
        { id: 1, author: 'Mike Milburn', authorAvatar: 'MM', content: 'This would be amazing for late night trading sessions!', createdAt: '2024-01-16' },
        { id: 2, author: 'Alex Chen', authorAvatar: 'AC', content: 'Definitely needed. Current white theme hurts my eyes at night.', createdAt: '2024-01-17' },
        { id: 3, author: 'Sarah Chen', authorAvatar: 'SC', content: 'Thanks for the feedback! Working on this now.', createdAt: '2024-01-18' }
      ],
      priority: 'high'
    },
    {
      id: 2,
      title: 'Bulk Import for Purchase History',
      description: 'Allow users to upload CSV files to bulk import their historical purchase data instead of manual entry.',
      author: 'Mike Rodriguez',
      authorAvatar: 'MR',
      category: 'feature',
      status: 'in-review',
      votes: 34,
      hasUserVoted: false,
      createdAt: '2024-01-12',
      comments: [
        { id: 4, author: 'Emma Wilson', authorAvatar: 'EW', content: 'Would save so much time! What formats would be supported?', createdAt: '2024-01-13' },
        { id: 5, author: 'Mike Rodriguez', authorAvatar: 'MR', content: 'Thinking CSV and Excel primarily. Maybe JSON for power users.', createdAt: '2024-01-13' }
      ],
      priority: 'medium'
    },
    {
      id: 3,
      title: 'Real-time Price Alerts',
      description: 'Send push notifications when tracked items hit target prices or significant market movements occur.',
      author: 'Alex Thompson',
      authorAvatar: 'AT',
      category: 'feature',
      status: 'completed',
      votes: 89,
      hasUserVoted: true,
      createdAt: '2024-01-08',
      comments: [
        { id: 6, author: 'Jordan Kim', authorAvatar: 'JK', content: 'This feature is live and working great! Thanks!', createdAt: '2024-01-20' },
        { id: 7, author: 'David Park', authorAvatar: 'DP', content: 'Can we add SMS alerts too?', createdAt: '2024-01-21' },
        { id: 8, author: 'Alex Thompson', authorAvatar: 'AT', content: '@David SMS coming in v2!', createdAt: '2024-01-21' }
      ],
      priority: 'high'
    },
    {
      id: 4,
      title: 'Integration with eBay API',
      description: 'Connect directly with eBay to automatically sync sales and purchase data without email parsing.',
      author: 'Jordan Kim',
      authorAvatar: 'JK',
      category: 'integration',
      status: 'in-review',
      votes: 56,
      hasUserVoted: false,
      createdAt: '2024-01-10',
      comments: [
        { id: 9, author: 'Sarah Chen', authorAvatar: 'SC', content: 'This would eliminate so many manual steps!', createdAt: '2024-01-11' },
        { id: 10, author: 'Mike Milburn', authorAvatar: 'MM', content: 'Looking into eBay API documentation now.', createdAt: '2024-01-12' }
      ],
      priority: 'high'
    },
    {
      id: 5,
      title: 'Advanced Analytics Dashboard',
      description: 'More detailed analytics with custom date ranges, profit margins by category, and predictive insights.',
      author: 'Emma Wilson',
      authorAvatar: 'EW',
      category: 'analytics',
      status: 'in-progress',
      votes: 73,
      hasUserVoted: false,
      createdAt: '2024-01-05',
      comments: [
        { id: 11, author: 'David Park', authorAvatar: 'DP', content: 'Love the predictive insights idea! Machine learning?', createdAt: '2024-01-06' },
        { id: 12, author: 'Emma Wilson', authorAvatar: 'EW', content: 'Yes! Using historical data to predict market trends.', createdAt: '2024-01-07' }
      ],
      priority: 'medium'
    },
    {
      id: 6,
      title: 'Two-Factor Authentication',
      description: 'Add 2FA support for enhanced account security using authenticator apps or SMS.',
      author: 'David Park',
      authorAvatar: 'DP',
      category: 'security',
      status: 'completed',
      votes: 42,
      hasUserVoted: true,
      createdAt: '2024-01-03',
      comments: [
        { id: 13, author: 'Mike Milburn', authorAvatar: 'MM', content: 'Security is crucial. Great addition!', createdAt: '2024-01-04' },
        { id: 14, author: 'David Park', authorAvatar: 'DP', content: 'Feature is now live! Check your account settings.', createdAt: '2024-01-20' }
      ],
      priority: 'high'
    }
  ]);

  const categories = [
    { value: 'all', label: 'All Categories' },
    { value: 'feature', label: 'New Feature' },
    { value: 'mobile', label: 'Mobile App' },
    { value: 'integration', label: 'Integration' },
    { value: 'analytics', label: 'Analytics' },
    { value: 'security', label: 'Security' },
    { value: 'ui', label: 'UI/UX' },
    { value: 'bug', label: 'Bug Fix' }
  ];

  const statusOptions = [
    { value: 'all', label: 'All Statuses', color: 'gray' },
    { value: 'in-review', label: 'In Review', color: 'blue' },
    { value: 'in-progress', label: 'In Progress', color: 'yellow' },
    { value: 'completed', label: 'Completed', color: 'green' }
  ];

  const handleVote = (requestId: number) => {
    setRequests(prev => prev.map(request => {
      if (request.id === requestId) {
        if (request.hasUserVoted) {
          // Undo vote
          return {
            ...request,
            votes: request.votes - 1,
            hasUserVoted: false
          };
        } else {
          // Add vote
          return {
            ...request,
            votes: request.votes + 1,
            hasUserVoted: true
          };
        }
      }
      return request;
    }));
  };

  const handleSubmitRequest = () => {
    if (newRequest.title.trim() && newRequest.description.trim()) {
      const request: FeatureRequest = {
        id: Date.now(),
        title: newRequest.title,
        description: newRequest.description,
        author: 'Mike Milburn', // Current user
        authorAvatar: 'MM',
        category: newRequest.category,
        status: 'in-review',
        votes: 1, // Author automatically votes
        hasUserVoted: true,
        createdAt: new Date().toISOString().split('T')[0],
        comments: [],
        priority: 'medium'
      };
      
      setRequests(prev => [request, ...prev]);
      setNewRequest({ title: '', description: '', category: 'feature' });
      setShowSubmitForm(false);
    }
  };

  const handleAddComment = (requestId: number) => {
    if (newComment.trim()) {
      const comment: Comment = {
        id: Date.now(),
        author: 'Mike Milburn', // Current user
        authorAvatar: 'MM',
        content: newComment.trim(),
        createdAt: new Date().toISOString().split('T')[0]
      };

      setRequests(prev => prev.map(request => 
        request.id === requestId 
          ? { ...request, comments: [...request.comments, comment] }
          : request
      ));

      setNewComment('');
      setShowComments(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      'in-review': { 
        label: 'In Review', 
        icon: Eye, 
        colors: isNeon 
          ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' 
          : 'bg-blue-100 text-blue-800 border-blue-200'
      },
      'in-progress': { 
        label: 'In Progress', 
        icon: Clock, 
        colors: isNeon 
          ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' 
          : 'bg-yellow-100 text-yellow-800 border-yellow-200'
      },
      'completed': { 
        label: 'Completed', 
        icon: CheckCircle, 
        colors: isNeon 
          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' 
          : 'bg-green-100 text-green-800 border-green-200'
      }
    };
    
    const config = statusConfig[status as keyof typeof statusConfig];
    const Icon = config.icon;
    
    return (
      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${config.colors}`}>
        <Icon className="w-3 h-3 mr-1" />
        {config.label}
      </span>
    );
  };

  const getPriorityBadge = (priority: string) => {
    const priorityConfig = {
      'low': { 
        colors: isNeon 
          ? 'bg-slate-500/20 text-slate-300' 
          : 'bg-gray-100 text-gray-600'
      },
      'medium': { 
        colors: isNeon 
          ? 'bg-cyan-500/20 text-cyan-300' 
          : 'bg-blue-100 text-blue-600'
      },
      'high': { 
        colors: isNeon 
          ? 'bg-red-500/20 text-red-300' 
          : 'bg-red-100 text-red-600'
      }
    };
    
    const config = priorityConfig[priority as keyof typeof priorityConfig];
    
    return (
      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${config.colors}`}>
        {priority.toUpperCase()}
      </span>
    );
  };

  // Filter and sort requests
  const filteredRequests = requests
    .filter(request => {
      const matchesStatus = statusFilter === 'all' || request.status === statusFilter;
      const matchesCategory = categoryFilter === 'all' || request.category === categoryFilter;
      const matchesSearch = request.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           request.description.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesStatus && matchesCategory && matchesSearch;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'votes':
          return b.votes - a.votes;
        case 'recent':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'comments':
          return b.comments.length - a.comments.length;
        default:
          return b.votes - a.votes;
      }
    });

  return (
    <div className={`flex-1 p-8 ${currentTheme.colors.background}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className={`text-3xl font-bold ${
            isNeon ? 'text-white' : 'text-gray-900'
          }`}>Feature Requests</h1>
          <p className={`mt-2 ${
            isNeon ? 'text-slate-400' : 'text-gray-600'
          }`}>
            Suggest features, vote on ideas, and track development progress
          </p>
        </div>
        
        <button
          onClick={() => setShowSubmitForm(true)}
          className={`flex items-center px-6 py-3 rounded-lg font-medium transition-all duration-300 ${
            isNeon
              ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 text-white hover:from-cyan-600 hover:to-emerald-600 shadow-lg shadow-cyan-500/25 hover:shadow-xl hover:shadow-cyan-500/40'
              : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg'
          }`}
        >
          <Plus className="w-5 h-5 mr-2" />
          Submit Request
        </button>
      </div>

      {/* Filters and Search */}
      <div className={`p-6 rounded-xl mb-8 ${
        isNeon
          ? 'dark-neon-card border border-slate-700/50'
          : 'bg-white border border-gray-200 shadow-sm'
      }`}>
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="relative flex-1 min-w-[300px]">
            <Search className={`w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 ${
              isNeon ? 'text-slate-400' : 'text-gray-400'
            }`} />
            <input
              type="text"
              placeholder="Search requests..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:ring-2 transition-all duration-300 ${
                isNeon
                  ? 'input-premium text-white placeholder-slate-400 border-slate-600/50 focus:ring-cyan-500 focus:border-cyan-500'
                  : 'bg-gray-50 border border-gray-300 focus:ring-blue-500 focus:border-blue-500'
              }`}
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={`px-4 py-2 rounded-lg focus:outline-none focus:ring-2 transition-all duration-300 ${
              isNeon
                ? 'input-premium text-white border-slate-600/50 focus:ring-cyan-500'
                : 'bg-gray-50 border border-gray-300 focus:ring-blue-500 focus:border-blue-500'
            }`}
          >
            {statusOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className={`px-4 py-2 rounded-lg focus:outline-none focus:ring-2 transition-all duration-300 ${
              isNeon
                ? 'input-premium text-white border-slate-600/50 focus:ring-cyan-500'
                : 'bg-gray-50 border border-gray-300 focus:ring-blue-500 focus:border-blue-500'
            }`}
          >
            {categories.map(category => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </select>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className={`px-4 py-2 rounded-lg focus:outline-none focus:ring-2 transition-all duration-300 ${
              isNeon
                ? 'input-premium text-white border-slate-600/50 focus:ring-cyan-500'
                : 'bg-gray-50 border border-gray-300 focus:ring-blue-500 focus:border-blue-500'
            }`}
          >
            <option value="votes">Most Voted</option>
            <option value="recent">Most Recent</option>
            <option value="comments">Most Discussed</option>
          </select>
        </div>
      </div>

      {/* View Toggle */}
      <div className="flex items-center justify-between mb-6">
        <div className={`flex items-center rounded-lg p-1 ${
          isNeon ? 'bg-slate-800/50 border border-slate-700/50' : 'bg-gray-100 border border-gray-200'
        }`}>
          <button
            onClick={() => setViewMode('list')}
            className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
              viewMode === 'list'
                ? isNeon
                  ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 text-white shadow-lg'
                  : 'bg-white text-gray-900 shadow-sm'
                : isNeon
                  ? 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <List className="w-4 h-4 mr-2" />
            List View
          </button>
          <button
            onClick={() => setViewMode('pipeline')}
            className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
              viewMode === 'pipeline'
                ? isNeon
                  ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 text-white shadow-lg'
                  : 'bg-white text-gray-900 shadow-sm'
                : isNeon
                  ? 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <LayoutDashboard className="w-4 h-4 mr-2" />
            Pipeline View
          </button>
        </div>
        
        <div className={`text-sm ${isNeon ? 'text-slate-400' : 'text-gray-500'}`}>
          {filteredRequests.length} request{filteredRequests.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Content Views */}
      {viewMode === 'list' ? (
        /* List View */
        <div className="space-y-6">
        {filteredRequests.map(request => (
          <div
            key={request.id}
            className={`p-6 rounded-xl transition-all duration-300 ${
              isNeon
                ? 'dark-neon-card border border-slate-700/50 hover:border-cyan-500/30'
                : 'bg-white border border-gray-200 hover:border-gray-300 shadow-sm hover:shadow-md'
            }`}
          >
            <div className="flex items-start space-x-4">
              {/* Vote Button */}
              <div className="flex flex-col items-center">
                <button
                  onClick={() => handleVote(request.id)}
                  className={`p-2 rounded-lg transition-all duration-300 ${
                    request.hasUserVoted
                      ? isNeon
                        ? 'bg-gradient-to-r from-cyan-500/20 to-emerald-500/20 text-cyan-400 border border-cyan-500/30'
                        : 'bg-blue-100 text-blue-600 border border-blue-200'
                      : isNeon
                        ? 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:border-cyan-500/30 hover:text-cyan-400'
                        : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  <ChevronUp className="w-5 h-5" />
                </button>
                <span className={`text-lg font-bold my-1 ${
                  isNeon ? 'text-white' : 'text-gray-900'
                }`}>
                  {request.votes}
                </span>
                <span className={`text-xs ${
                  isNeon ? 'text-slate-400' : 'text-gray-500'
                }`}>
                  votes
                </span>
              </div>

              {/* Content */}
              <div className="flex-1">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className={`text-xl font-semibold mb-2 ${
                      isNeon ? 'text-white' : 'text-gray-900'
                    }`}>
                      {request.title}
                    </h3>
                    <p className={`mb-4 leading-relaxed ${
                      isNeon ? 'text-slate-300' : 'text-gray-600'
                    }`}>
                      {request.description}
                    </p>
                  </div>
                  
                  <div className="flex items-center space-x-2 ml-4">
                    {getPriorityBadge(request.priority)}
                    {getStatusBadge(request.status)}
                  </div>
                </div>

                {/* Meta Information */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                        isNeon
                          ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 text-white'
                          : 'bg-gradient-to-r from-blue-500 to-blue-600 text-white'
                      }`}>
                        {request.authorAvatar}
                      </div>
                      <span className={`ml-2 text-sm ${
                        isNeon ? 'text-slate-400' : 'text-gray-500'
                      }`}>
                        {request.author}
                      </span>
                    </div>

                    <div className="flex items-center">
                      <Calendar className={`w-4 h-4 mr-1 ${
                        isNeon ? 'text-slate-400' : 'text-gray-400'
                      }`} />
                      <span className={`text-sm ${
                        isNeon ? 'text-slate-400' : 'text-gray-500'
                      }`}>
                        {new Date(request.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    <button
                      onClick={() => setShowComments(request.id)}
                      className={`flex items-center transition-colors hover:${
                        isNeon ? 'text-cyan-400' : 'text-blue-600'
                      }`}
                    >
                      <MessageSquare className={`w-4 h-4 mr-1 ${
                        isNeon ? 'text-slate-400' : 'text-gray-400'
                      }`} />
                      <span className={`text-sm ${
                        isNeon ? 'text-slate-400' : 'text-gray-500'
                      }`}>
                        {request.comments.length} comments
                      </span>
                    </button>

                    <div className="flex items-center">
                      <Tag className={`w-4 h-4 mr-1 ${
                        isNeon ? 'text-slate-400' : 'text-gray-400'
                      }`} />
                      <span className={`text-sm ${
                        isNeon ? 'text-slate-400' : 'text-gray-500'
                      }`}>
                        {categories.find(c => c.value === request.category)?.label}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      ) : (
        /* Pipeline View */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {statusOptions.filter(status => status.value !== 'all').map(status => {
            const statusRequests = filteredRequests.filter(req => req.status === status.value);
            
            return (
              <div key={status.value} className={`rounded-xl p-6 ${
                isNeon
                  ? 'dark-neon-card border border-slate-700/50'
                  : 'bg-white border border-gray-200 shadow-sm'
              }`}>
                {/* Status Header */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center space-x-3">
                    <div className={`w-3 h-3 rounded-full ${
                      status.color === 'blue' ? 'bg-blue-500' :
                      status.color === 'yellow' ? 'bg-yellow-500' :
                      status.color === 'green' ? 'bg-green-500' : 'bg-gray-500'
                    }`}></div>
                    <h3 className={`text-lg font-semibold ${
                      isNeon ? 'text-white' : 'text-gray-900'
                    }`}>
                      {status.label}
                    </h3>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    isNeon
                      ? 'bg-slate-800/50 text-slate-300'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {statusRequests.length}
                  </span>
                </div>

                {/* Requests in this status */}
                <div className="space-y-4">
                  {statusRequests.map(request => (
                    <div
                      key={request.id}
                      className={`p-4 rounded-lg transition-all duration-300 cursor-pointer ${
                        isNeon
                          ? 'bg-slate-800/30 border border-slate-700/30 hover:border-cyan-500/50 hover:bg-slate-800/50'
                          : 'bg-gray-50 border border-gray-200 hover:border-gray-300 hover:bg-gray-100'
                      }`}
                    >
                      {/* Request Header */}
                      <div className="flex items-start justify-between mb-3">
                        <h4 className={`font-medium text-sm leading-tight ${
                          isNeon ? 'text-white' : 'text-gray-900'
                        }`}>
                          {request.title}
                        </h4>
                        <div className="flex items-center space-x-1 ml-2">
                          {getPriorityBadge(request.priority)}
                        </div>
                      </div>

                      {/* Request Description */}
                      <p className={`text-sm mb-3 line-clamp-2 ${
                        isNeon ? 'text-slate-400' : 'text-gray-600'
                      }`}>
                        {request.description}
                      </p>

                      {/* Vote and Meta Info */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          {/* Vote Button */}
                          <button
                            onClick={() => handleVote(request.id)}
                            className={`flex items-center space-x-1 px-2 py-1 rounded text-xs transition-all duration-300 ${
                              request.hasUserVoted
                                ? isNeon
                                  ? 'bg-gradient-to-r from-cyan-500/20 to-emerald-500/20 text-cyan-400 border border-cyan-500/30'
                                  : 'bg-blue-100 text-blue-600 border border-blue-200'
                                : isNeon
                                  ? 'bg-slate-700/50 text-slate-400 border border-slate-600/50 hover:border-cyan-500/30 hover:text-cyan-400'
                                  : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
                            }`}
                          >
                            <ChevronUp className="w-3 h-3" />
                            <span className="font-medium">{request.votes}</span>
                          </button>

                          {/* Comments */}
                          <button
                            onClick={() => setShowComments(request.id)}
                            className={`flex items-center space-x-1 transition-colors hover:${
                              isNeon ? 'text-cyan-400' : 'text-blue-600'
                            }`}
                          >
                            <MessageSquare className={`w-3 h-3 ${
                              isNeon ? 'text-slate-500' : 'text-gray-400'
                            }`} />
                            <span className={`text-xs ${
                              isNeon ? 'text-slate-500' : 'text-gray-500'
                            }`}>
                              {request.comments.length}
                            </span>
                          </button>
                        </div>

                        {/* Author Avatar */}
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                          isNeon
                            ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 text-white'
                            : 'bg-gradient-to-r from-blue-500 to-blue-600 text-white'
                        }`}>
                          {request.authorAvatar}
                        </div>
                      </div>

                      {/* Category Tag */}
                      <div className="mt-3 pt-3 border-t border-opacity-20 border-gray-400">
                        <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                          isNeon
                            ? 'bg-slate-700/50 text-slate-300'
                            : 'bg-gray-200 text-gray-700'
                        }`}>
                          {categories.find(c => c.value === request.category)?.label}
                        </span>
                      </div>
                    </div>
                  ))}

                  {/* Empty State */}
                  {statusRequests.length === 0 && (
                    <div className={`text-center py-8 ${
                      isNeon ? 'text-slate-500' : 'text-gray-400'
                    }`}>
                      <div className="mb-2">No requests</div>
                      <div className="text-xs">in this status</div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Comments Modal */}
      {showComments && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`w-full max-w-4xl max-h-[80vh] rounded-xl overflow-hidden ${
            isNeon
              ? 'dark-neon-card border border-slate-700/50'
              : 'bg-white border border-gray-200 shadow-xl'
          }`}>
            {(() => {
              const request = requests.find(r => r.id === showComments);
              if (!request) return null;

              return (
                <>
                  {/* Header */}
                  <div className={`p-6 border-b ${
                    isNeon ? 'border-slate-700/50' : 'border-gray-200'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className={`text-xl font-bold ${
                          isNeon ? 'text-white' : 'text-gray-900'
                        }`}>
                          Comments
                        </h2>
                        <p className={`text-sm mt-1 ${
                          isNeon ? 'text-slate-400' : 'text-gray-600'
                        }`}>
                          {request.title}
                        </p>
                      </div>
                      <button
                        onClick={() => setShowComments(null)}
                        className={`p-2 rounded-lg transition-colors ${
                          isNeon
                            ? 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                            : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        <X className="w-6 h-6" />
                      </button>
                    </div>
                  </div>

                  {/* Comments List */}
                  <div className="max-h-96 overflow-y-auto p-6">
                    {request.comments.length > 0 ? (
                      <div className="space-y-4">
                        {request.comments.map(comment => (
                          <div key={comment.id} className={`p-4 rounded-lg ${
                            isNeon 
                              ? 'bg-slate-800/30 border border-slate-700/30'
                              : 'bg-gray-50 border border-gray-200'
                          }`}>
                            <div className="flex items-start space-x-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                                isNeon
                                  ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 text-white'
                                  : 'bg-gradient-to-r from-blue-500 to-blue-600 text-white'
                              }`}>
                                {comment.authorAvatar}
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center space-x-2 mb-2">
                                  <span className={`font-medium text-sm ${
                                    isNeon ? 'text-white' : 'text-gray-900'
                                  }`}>
                                    {comment.author}
                                  </span>
                                  <span className={`text-xs ${
                                    isNeon ? 'text-slate-500' : 'text-gray-500'
                                  }`}>
                                    {new Date(comment.createdAt).toLocaleDateString()}
                                  </span>
                                </div>
                                <p className={`text-sm leading-relaxed ${
                                  isNeon ? 'text-slate-300' : 'text-gray-700'
                                }`}>
                                  {comment.content}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className={`text-center py-8 ${
                        isNeon ? 'text-slate-400' : 'text-gray-500'
                      }`}>
                        <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p>No comments yet</p>
                        <p className="text-sm mt-1">Be the first to comment on this request</p>
                      </div>
                    )}
                  </div>

                  {/* Add Comment Form */}
                  <div className={`p-6 border-t ${
                    isNeon ? 'border-slate-700/50' : 'border-gray-200'
                  }`}>
                    <div className="space-y-4">
                      <textarea
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Add your comment..."
                        rows={3}
                        className={`w-full px-4 py-3 rounded-lg focus:outline-none focus:ring-2 transition-all duration-300 resize-none ${
                          isNeon
                            ? 'input-premium text-white placeholder-slate-400 border-slate-600/50 focus:ring-cyan-500 focus:border-cyan-500'
                            : 'border border-gray-300 focus:ring-blue-500 focus:border-blue-500'
                        }`}
                      />
                      <div className="flex justify-end space-x-3">
                        <button
                          onClick={() => setShowComments(null)}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
                            isNeon
                              ? 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleAddComment(request.id)}
                          disabled={!newComment.trim()}
                          className={`flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed ${
                            isNeon
                              ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 text-white hover:from-cyan-600 hover:to-emerald-600'
                              : 'bg-blue-600 text-white hover:bg-blue-700'
                          }`}
                        >
                          <Send className="w-4 h-4 mr-2" />
                          Post Comment
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Submit Request Modal */}
      {showSubmitForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`w-full max-w-2xl rounded-xl p-8 ${
            isNeon
              ? 'dark-neon-card border border-slate-700/50'
              : 'bg-white border border-gray-200 shadow-xl'
          }`}>
            <div className="flex items-center justify-between mb-6">
              <h2 className={`text-2xl font-bold ${
                isNeon ? 'text-white' : 'text-gray-900'
              }`}>
                Submit Feature Request
              </h2>
              <button
                onClick={() => setShowSubmitForm(false)}
                className={`p-2 rounded-lg transition-colors ${
                  isNeon
                    ? 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                }`}
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label className={`block text-sm font-medium mb-2 ${
                  isNeon ? 'text-white' : 'text-gray-700'
                }`}>
                  Title *
                </label>
                <input
                  type="text"
                  value={newRequest.title}
                  onChange={(e) => setNewRequest(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Brief, descriptive title for your request"
                  className={`w-full px-4 py-3 rounded-lg focus:outline-none focus:ring-2 transition-all duration-300 ${
                    isNeon
                      ? 'input-premium text-white placeholder-slate-400 border-slate-600/50 focus:ring-cyan-500 focus:border-cyan-500'
                      : 'border border-gray-300 focus:ring-blue-500 focus:border-blue-500'
                  }`}
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${
                  isNeon ? 'text-white' : 'text-gray-700'
                }`}>
                  Category
                </label>
                <select
                  value={newRequest.category}
                  onChange={(e) => setNewRequest(prev => ({ ...prev, category: e.target.value }))}
                  className={`w-full px-4 py-3 rounded-lg focus:outline-none focus:ring-2 transition-all duration-300 ${
                    isNeon
                      ? 'input-premium text-white border-slate-600/50 focus:ring-cyan-500'
                      : 'border border-gray-300 focus:ring-blue-500 focus:border-blue-500'
                  }`}
                >
                  {categories.filter(c => c.value !== 'all').map(category => (
                    <option key={category.value} value={category.value}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${
                  isNeon ? 'text-white' : 'text-gray-700'
                }`}>
                  Description *
                </label>
                <textarea
                  value={newRequest.description}
                  onChange={(e) => setNewRequest(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Detailed description of the feature you'd like to see. Include use cases and benefits."
                  rows={6}
                  className={`w-full px-4 py-3 rounded-lg focus:outline-none focus:ring-2 transition-all duration-300 resize-none ${
                    isNeon
                      ? 'input-premium text-white placeholder-slate-400 border-slate-600/50 focus:ring-cyan-500 focus:border-cyan-500'
                      : 'border border-gray-300 focus:ring-blue-500 focus:border-blue-500'
                  }`}
                />
              </div>

              <div className="flex items-center justify-end space-x-4 pt-4">
                <button
                  onClick={() => setShowSubmitForm(false)}
                  className={`px-6 py-3 rounded-lg font-medium transition-all duration-300 ${
                    isNeon
                      ? 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 border border-slate-700/50'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300'
                  }`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitRequest}
                  disabled={!newRequest.title.trim() || !newRequest.description.trim()}
                  className={`flex items-center px-6 py-3 rounded-lg font-medium transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed ${
                    isNeon
                      ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 text-white hover:from-cyan-600 hover:to-emerald-600 shadow-lg shadow-cyan-500/25'
                      : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg'
                  }`}
                >
                  <Send className="w-5 h-5 mr-2" />
                  Submit Request
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FeatureRequests; 