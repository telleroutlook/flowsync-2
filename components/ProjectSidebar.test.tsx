import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProjectSidebar } from './ProjectSidebar';
import { describe, it, expect, vi } from 'vitest';
import { I18nProvider } from '../src/i18n';

const projects = [
  { id: 'p1', name: 'Alpha', description: 'First' },
  { id: 'p2', name: 'Beta', description: 'Second' },
];

describe('ProjectSidebar', () => {
  it('handles select, create, edit, delete, and close actions', async () => {
    const user = userEvent.setup();
    const onSelectProject = vi.fn();
    const onCreateProject = vi.fn();
    const onEditProject = vi.fn();
    const onRequestDeleteProject = vi.fn();
    const onClose = vi.fn();

    render(
      <I18nProvider>
        <ProjectSidebar
          projects={projects}
          activeProjectId="p1"
          onSelectProject={onSelectProject}
          onCreateProject={onCreateProject}
          onEditProject={onEditProject}
          onRequestDeleteProject={onRequestDeleteProject}
          onClose={onClose}
        />
      </I18nProvider>
    );

    await user.click(screen.getByText('Beta'));
    expect(onSelectProject).toHaveBeenCalledWith('p2');

    await user.click(screen.getByTitle('Create New Project'));
    expect(onCreateProject).toHaveBeenCalledTimes(1);
    
    await user.click(screen.getByTitle('Collapse Sidebar'));
    expect(onClose).toHaveBeenCalledTimes(1);

    const actionButtons = screen.getAllByTitle('Project actions');
    const secondActionButton = actionButtons[1];
    if (!secondActionButton) throw new Error('Expected second project action button.');
    await user.click(secondActionButton);
    await user.click(screen.getByText('Edit Project'));
    expect(onEditProject).toHaveBeenCalledWith(projects[1]);

    await user.click(secondActionButton);
    await user.click(screen.getByText('Delete Project'));
    expect(onRequestDeleteProject).toHaveBeenCalledWith(projects[1]);
  });
});
