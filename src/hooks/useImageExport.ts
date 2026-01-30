import { useCallback } from 'react';
import html2canvas from 'html2canvas';
import { makeSafeFileName, triggerDownload } from '../utils/export';

interface UseImageExportProps {
  viewContainerRef: React.RefObject<HTMLElement | null>;
  viewMode: string;
  projectId: string;
  projectName: string;
}

export const useImageExport = ({ viewContainerRef, viewMode, projectId, projectName }: UseImageExportProps) => {
  const handleExportImage = useCallback(async () => {
    const element = viewContainerRef.current;
    if (!element) return;

    try {
      // Create a stamp for the filename
      const exportDate = new Date();
      const fileStamp = exportDate.toISOString().slice(0, 10);
      const safeProjectName = makeSafeFileName(projectName);
      // Use short ID as project number if it looks like a UUID or is long
      const projectNum = projectId.length > 8 ? projectId.slice(0, 8) : projectId;
      const filename = `${projectNum}-${safeProjectName}-${viewMode.toLowerCase()}-${fileStamp}.png`;

      // 1. Clone the node to manipulate styles for full capture without affecting UI
      const clone = element.cloneNode(true) as HTMLElement;

      // 2. We need to handle internal scrollable elements. 
      // The strategy is to find the scrollable container in the clone and force it to be full height/width.
      // Since we don't know exactly which child is scrolling, we'll try to expand the main container 
      // and ensure children don't constrain themselves.
      
      // Get the real scroll dimensions from the original element
      // Check if the element itself scrolls or a child
      let targetWidth = element.scrollWidth;
      let targetHeight = element.scrollHeight;

      // Often the ref is on a wrapper, and the first child is the scrollable one or the content.
      // Let's inspect the first child's size too.
      if (element.firstElementChild) {
         targetWidth = Math.max(targetWidth, element.firstElementChild.scrollWidth);
         targetHeight = Math.max(targetHeight, element.firstElementChild.scrollHeight);
      }

      // 3. Style the clone to be off-screen but visible (for rendering) and fully expanded
      clone.style.position = 'fixed';
      clone.style.top = '-10000px';
      clone.style.left = '-10000px';
      clone.style.zIndex = '-1000';
      clone.style.overflow = 'visible';
      // Force dimensions to fit all content
      clone.style.width = `${targetWidth}px`;
      clone.style.height = `${targetHeight}px`;
      clone.style.maxHeight = 'none';
      clone.style.maxWidth = 'none';

      // Remove specific height constraints on children that might cause clipping
      // This is a heuristic; might need tuning for specific views (Gantt/Board)
      const allElements = clone.querySelectorAll('*');
      allElements.forEach((el) => {
        if (el instanceof HTMLElement) {
             // If the element was a scroll container, make it visible and auto-sized
             const style = window.getComputedStyle(el);
             if (style.overflow !== 'visible' || style.overflowX !== 'visible' || style.overflowY !== 'visible') {
                 el.style.overflow = 'visible';
             }
             // Remove height limits if they seem to be for scrolling
             if (el.style.height === '100%' || el.className.includes('h-full')) {
                el.style.height = 'auto'; 
             }
        }
      });
      
      // Specific tweaks for our known views based on their likely structure
      // Gantt often has a horizontal scroll.
      if (viewMode === 'GANTT') {
          // Ensure the gantt container expands
          clone.style.width = 'max-content'; 
      }
      
      document.body.appendChild(clone);

      // 4. Capture
      const canvas = await html2canvas(clone, {
        backgroundColor: '#ffffff', // Ensure white background (or use theme bg)
        logging: false,
        useCORS: true, // If we have external images (like avatars)
        width: clone.scrollWidth,
        height: clone.scrollHeight,
        scale: 2, // Retina quality
      });

      // 5. Cleanup
      document.body.removeChild(clone);

      // 6. Download
      canvas.toBlob((blob) => {
        if (blob) {
          triggerDownload(blob, filename);
        }
      });
    } catch (error) {
      console.error('Image export failed:', error);
      alert('Failed to export image. Please try again.');
    }
  }, [viewContainerRef, viewMode, projectName]);

  return { handleExportImage };
};
