import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useImageExport } from './useImageExport';
import html2canvas from 'html2canvas';
import * as exportUtils from '../utils/export';

// Mock html2canvas
vi.mock('html2canvas', () => ({
  default: vi.fn(),
}));

// Mock utils
vi.spyOn(exportUtils, 'triggerDownload').mockImplementation(() => {});

describe('useImageExport', () => {
  const mockRef: React.RefObject<HTMLDivElement> = { current: document.createElement('div') };
  const viewMode = 'BOARD';
  const projectId = 'proj-12345678';
  const projectName = 'Test Project';

  beforeEach(() => {
    vi.clearAllMocks();
    mockRef.current = document.createElement('div');
    document.body.appendChild(mockRef.current);
    // Mock scroll dimensions
    Object.defineProperty(mockRef.current, 'scrollWidth', { value: 1000, configurable: true });
    Object.defineProperty(mockRef.current, 'scrollHeight', { value: 2000, configurable: true });
  });

  afterEach(() => {
    document.body.removeChild(mockRef.current);
  });

  it('should be defined', () => {
    const { result } = renderHook(() => useImageExport({ viewContainerRef: mockRef, viewMode, projectId, projectName }));
    expect(result.current.handleExportImage).toBeDefined();
  });

  it('should call html2canvas and download image', async () => {
    const mockCanvas = document.createElement('canvas');
    mockCanvas.toBlob = vi.fn((callback) => callback(new Blob(['test'], { type: 'image/png' })));
    (html2canvas as any).mockResolvedValue(mockCanvas);

    const { result } = renderHook(() => useImageExport({ viewContainerRef: mockRef, viewMode, projectId, projectName }));

    await act(async () => {
      await result.current.handleExportImage();
    });

    expect(html2canvas).toHaveBeenCalled();
    expect(exportUtils.triggerDownload).toHaveBeenCalled();

    // Check filename in download call
    const downloadCall = vi.mocked(exportUtils.triggerDownload).mock.calls[0];
    if (downloadCall) {
      expect(downloadCall[1]).toContain('proj-123-test-project-board-');
      expect(downloadCall[1]).toContain('.png');
    }
  });

  it('should handle null ref', async () => {
    const nullRef = { current: null };
    const { result } = renderHook(() => useImageExport({ viewContainerRef: nullRef, viewMode, projectId, projectName }));

    await act(async () => {
      await result.current.handleExportImage();
    });

    expect(html2canvas).not.toHaveBeenCalled();
  });
});
