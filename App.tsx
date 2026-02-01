import { useState, useEffect, useCallback } from 'react';
import { ChartProjectSidebar } from './components/ChartProjectSidebar';
import { ChartGallery } from './components/ChartGallery';
import { CreateChartProjectModal } from './components/CreateChartProjectModal';
import { AIChartGenerator } from './components/AIChartGenerator';
import { ChartExportModal } from './components/ChartExportModal';
import { LoginModal } from './components/LoginModal';
import { useAuth } from './src/hooks/useAuth';
import { useWorkspaces } from './src/hooks/useWorkspaces';
import { useChartData } from './src/hooks/useChartData';
import { Plus, BarChart3, Download, Wand2 } from 'lucide-react';
import { MobileNavBar, MobileTab } from './components/MobileNavBar';

function App() {

  // Mobile State
  const [mobileTab, setMobileTab] = useState<MobileTab>('workspace');
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // UI State
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isAiGeneratorOpen, setIsAiGeneratorOpen] = useState(false);
  const [selectedChartId, setSelectedChartId] = useState<string | null>(null);

  // Auth & Workspaces
  const { user, login, register } = useAuth();
  const {
    activeWorkspaceId,
  } = useWorkspaces(user);

  // Chart Data
  const {
    chartProjects,
    activeCharts,
    activeDataSources,
    activeChartProjectId,
    activeChartProject,
    setActiveChartProjectId,
    createChartProject,
    deleteChartProject,
    deleteChart,
  } = useChartData(activeWorkspaceId);

  // Handlers
  const handleSelectChart = useCallback((chartId: string) => {
    setSelectedChartId(chartId);
  }, []);

  const handleCreateProject = useCallback(async (name: string, description: string) => {
    await createChartProject({ name, description });
  }, [createChartProject]);

  const handleDeleteProject = useCallback(async (projectId: string) => {
    await deleteChartProject(projectId);
  }, [deleteChartProject]);

  const handleDeleteChart = useCallback(async (chartId: string) => {
    if (!activeChartProjectId) return;
    await deleteChart(chartId, activeChartProjectId);
    if (selectedChartId === chartId) {
      setSelectedChartId(null);
    }
  }, [activeChartProjectId, deleteChart, selectedChartId]);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-900">
      {/* Desktop Layout */}
      {!isMobile && (
        <div className="flex flex-1 overflow-hidden">
          {/* Left Sidebar - Chart Projects */}
          <ChartProjectSidebar
            chartProjects={chartProjects}
            activeChartProjectId={activeChartProjectId}
            onSelectProject={setActiveChartProjectId}
            onCreateProject={() => setIsCreateProjectOpen(true)}
            onDeleteProject={handleDeleteProject}
          />

          {/* Main Content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                  <BarChart3 className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {activeChartProjectId
                      ? chartProjects.find(p => p.id === activeChartProjectId)?.name
                      : 'ChartSync AI'}
                  </h1>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {activeChartProjectId ? '图表项目' : '选择一个图表项目开始'}
                  </p>
                </div>
              </div>

              {/* Actions */}
              {activeChartProjectId && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsAiGeneratorOpen(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-lg hover:from-purple-600 hover:to-pink-700 transition-all text-sm font-medium"
                    title="AI 图表生成器"
                  >
                    <Wand2 className="w-4 h-4" />
                    AI 生成
                  </button>
                  <button
                    onClick={() => setIsExportOpen(true)}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    title="导出图表"
                  >
                    <Download className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                  </button>
                </div>
              )}
            </div>

            {/* Content Area */}
            {activeChartProjectId ? (
              <>
                {/* Tabs for Gallery / Data Sources */}
                <div className="h-12 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center px-4 gap-2">
                  <button className="px-4 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    图表
                  </button>
                  <button className="px-4 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                    数据源
                  </button>
                </div>

                {/* Chart Gallery */}
                <ChartGallery
                  charts={activeCharts}
                  onSelectChart={handleSelectChart}
                  onDeleteChart={handleDeleteChart}
                  projectId={activeChartProjectId}
                />
              </>
            ) : (
              // Empty State
              <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                <div className="text-center">
                  <BarChart3 className="w-16 h-16 mx-auto mb-4 text-gray-400 dark:text-gray-500" />
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                    欢迎使用 ChartSync AI
                  </h2>
                  <p className="text-gray-500 dark:text-gray-400 mb-6">
                    选择一个图表项目或创建新项目开始使用
                  </p>
                  <button
                    onClick={() => setIsCreateProjectOpen(true)}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:from-blue-600 hover:to-purple-700 transition-all font-medium"
                  >
                    <Plus className="w-5 h-5" />
                    创建图表项目
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Panel - Chat */}
          {/* Temporarily disable chat panel */}
          {/* {isChatOpen && activeChartProjectId && (
            <div className="w-96 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700">
              <ChatInterface
                messages={messages}
              />
            </div>
          )} */}
        </div>
      )}

      {/* Mobile Layout */}
      {isMobile && (
        <div className="flex-1 overflow-hidden">
          {mobileTab === 'workspace' && activeChartProjectId ? (
            <ChartGallery
              charts={activeCharts}
              onSelectChart={handleSelectChart}
              onDeleteChart={handleDeleteChart}
              projectId={activeChartProjectId}
            />
          ) : (
            <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
              <div className="text-center">
                <BarChart3 className="w-12 h-12 mx-auto mb-3 text-gray-400 dark:text-gray-500" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  {mobileTab === 'workspace' ? '选择项目' : 'ChartSync AI'}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  {mobileTab === 'workspace'
                    ? '在侧边栏选择一个图表项目'
                    : '切换到工作区标签'}
                </p>
              </div>
            </div>
          )}

          {/* Mobile Bottom Navigation */}
          <MobileNavBar
            activeTab={mobileTab}
            onSelectTab={setMobileTab}
          />
        </div>
      )}

      {/* Modals */}
      <CreateChartProjectModal
        isOpen={isCreateProjectOpen}
        onClose={() => setIsCreateProjectOpen(false)}
        onCreate={handleCreateProject}
      />

      <AIChartGenerator
        isOpen={isAiGeneratorOpen}
        onClose={() => setIsAiGeneratorOpen(false)}
        projectId={activeChartProjectId || ''}
        dataSources={activeDataSources}
        onGenerated={(draftId) => {
          setIsAiGeneratorOpen(false);
          // TODO: Show draft approval notification
          console.log('Draft generated:', draftId);
        }}
      />

      <ChartExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        projectId={activeChartProjectId || ''}
        charts={activeCharts}
        projectName={activeChartProject?.name || 'Chart Project'}
      />

      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        onLogin={login}
        onRegister={register}
      />

      {/* Temporarily disable workspace modal */}
      {/* <WorkspaceModal
        isOpen={isWorkspaceOpen}
        onClose={() => setIsWorkspaceOpen(false)}
        onCreate={createWorkspace}
      />*/}

      {/* Temporarily disable profile modal */}
      {/* <UserProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        user={user}
        onUpdate={updateProfile}
        onLogout={logout}
      />*/}
    </div>
  );
}

export default App;
