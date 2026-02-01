import React, { useState } from 'react';
import { Plus, Trash2, BarChart3 } from 'lucide-react';
import type { ChartProject } from '../types';

interface ChartProjectSidebarProps {
  chartProjects: ChartProject[];
  activeChartProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  onCreateProject: () => void;
  onDeleteProject: (projectId: string) => void;
}

export function ChartProjectSidebar({
  chartProjects,
  activeChartProjectId,
  onSelectProject,
  onCreateProject,
  onDeleteProject,
}: ChartProjectSidebarProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const handleDeleteClick = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    setShowDeleteConfirm(projectId);
  };

  const handleDeleteConfirm = (projectId: string) => {
    onDeleteProject(projectId);
    setShowDeleteConfirm(null);
  };

  return (
    <div className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">图表项目</h2>
          <button
            onClick={onCreateProject}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title="新建图表项目"
          >
            <Plus className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          </button>
        </div>
      </div>

      {/* Project List */}
      <div className="flex-1 overflow-y-auto p-2">
        {chartProjects.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">暂无图表项目</p>
            <p className="text-xs mt-1">点击上方 + 创建</p>
          </div>
        ) : (
          <div className="space-y-1">
            {chartProjects.map((project) => (
              <div
                key={project.id}
                onClick={() => onSelectProject(project.id)}
                className={`
                  group relative flex items-center p-3 rounded-lg cursor-pointer transition-colors
                  ${
                    activeChartProjectId === project.id
                      ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700 border border-transparent'
                  }
                `}
              >
                {/* Project Icon */}
                {project.icon ? (
                  <span className="text-2xl mr-3">{project.icon}</span>
                ) : (
                  <div className="w-8 h-8 mr-3 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                    <BarChart3 className="w-5 h-5 text-white" />
                  </div>
                )}

                {/* Project Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {project.name}
                  </h3>
                  {project.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {project.description}
                    </p>
                  )}
                </div>

                {/* Delete Button */}
                <button
                  onClick={(e) => handleDeleteClick(e, project.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-all"
                  title="删除项目"
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                </button>

                {/* Delete Confirmation */}
                {showDeleteConfirm === project.id && (
                  <div className="absolute inset-0 bg-white dark:bg-gray-800 rounded-lg flex items-center justify-center z-10 border border-red-200 dark:border-red-800">
                    <div className="text-center px-2">
                      <p className="text-xs text-gray-600 dark:text-gray-300 mb-2">确认删除?</p>
                      <div className="flex gap-2 justify-center">
                        <button
                          onClick={() => handleDeleteConfirm(project.id)}
                          className="px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600"
                        >
                          删除
                        </button>
                        <button
                          onClick={() => setShowDeleteConfirm(null)}
                          className="px-2 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 text-center">
        {chartProjects.length} 个项目
      </div>
    </div>
  );
}
