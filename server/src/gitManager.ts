import simpleGit, { SimpleGit } from 'simple-git';
import path from 'path';

export class GitManager {
  private git: SimpleGit;
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = path.resolve(baseDir);
    this.git = simpleGit(this.baseDir);
  }

  async getStatus() {
    try {
      const isRepo = await this.git.checkIsRepo();
      if (!isRepo) {
        return { isInitialized: false };
      }

      const status = await this.git.status();
      const renamedFiles = status.renamed.map((entry) => `${entry.from} -> ${entry.to}`);
      return {
        isInitialized: true,
        currentBranch: status.current,
        hasUncommittedChanges: !status.isClean(),
        staged: [...status.staged, ...status.created, ...renamedFiles],
        modified: status.modified,
        untracked: status.not_added,
        deleted: status.deleted,
      };
    } catch (error) {
      console.error('Error getting git status:', error);
      return { isInitialized: false, error: String(error) };
    }
  }

  async initRepo() {
    try {
      const isRepo = await this.git.checkIsRepo();
      if (isRepo) return { success: true };
      await this.git.init();
      // Initial commit
      await this.git.add('.');
      await this.git.commit('Initial commit by DocJin Wiki');
      return { success: true };
    } catch (error) {
      console.error('Error initializing git repo:', error);
      return { success: false, error: String(error) };
    }
  }

  async commit(message: string = 'Update via DocJin Wiki') {
    try {
      const isRepo = await this.git.checkIsRepo();
      if (!isRepo) {
        throw new Error('Git repository not initialized');
      }

      await this.git.add('.');
      const status = await this.git.status();
      if (status.isClean()) {
        return { success: true, commit: 'Nothing to commit' };
      }
      const commitResult = await this.git.commit(message);
      return { success: true, commit: commitResult.commit };
    } catch (error) {
      console.error('Error committing changes:', error);
      return { success: false, error: String(error) };
    }
  }

  async getLog(filePath?: string) {
    try {
      const isRepo = await this.git.checkIsRepo();
      if (!isRepo) {
        return { isInitialized: false, logs: [] };
      }

      const options = filePath ? [filePath] : undefined;
      const logResult = await this.git.log(options);
      
      return {
        isInitialized: true,
        logs: logResult.all
      };
    } catch (error) {
      console.error('Error getting git log:', error);
      return { isInitialized: false, error: String(error), logs: [] };
    }
  }
}
