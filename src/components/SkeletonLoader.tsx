import React from 'react'

interface SkeletonLoaderProps {
  count?: number
  className?: string
}

export const CardSkeleton: React.FC = () => (
  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-700 animate-pulse transition-colors">
    <div className="flex items-center justify-between">
      <div className="flex-1">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24 mb-2"></div>
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-32"></div>
      </div>
      <div className="h-12 w-12 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
    </div>
  </div>
)

export const TableRowSkeleton: React.FC = () => (
  <tr className="animate-pulse">
    <td className="px-6 py-4 whitespace-nowrap">
      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20"></div>
    </td>
    <td className="px-6 py-4 whitespace-nowrap">
      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24"></div>
    </td>
    <td className="px-6 py-4 whitespace-nowrap">
      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32"></div>
    </td>
    <td className="px-6 py-4 whitespace-nowrap">
      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20"></div>
    </td>
    <td className="px-6 py-4 whitespace-nowrap">
      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
    </td>
    <td className="px-6 py-4 whitespace-nowrap">
      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
    </td>
  </tr>
)

export const ChartSkeleton: React.FC = () => (
  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-700 animate-pulse transition-colors">
    <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-48 mb-4"></div>
    <div className="h-64 bg-gray-100 dark:bg-gray-900/50 rounded"></div>
  </div>
)

export const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({ count = 3, className = '' }) => (
  <div className={className}>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="animate-pulse">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded mb-2"></div>
      </div>
    ))}
  </div>
)

