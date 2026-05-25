import { replaceDateInString } from '@utils/utils';
import { App, Notice, PluginSettingTab, Setting } from 'obsidian';

import languages from '@utils/languages';
import BookSearchPlugin from '../main';
import { FileNameFormatSuggest } from './suggesters/FileNameFormatSuggester';
import { FileSuggest } from './suggesters/FileSuggester';
import { FolderSuggest } from './suggesters/FolderSuggester';

const docUrl = 'https://github.com/anpigon/obsidian-book-search-plugin';

export enum DefaultFrontmatterKeyType {
  snakeCase = 'Snake Case',
  camelCase = 'Camel Case',
}

export interface BookSearchPluginSettings {
  folder: string;
  fileNameFormat: string;
  frontmatter: string;
  content: string;
  useDefaultFrontmatter: boolean;
  defaultFrontmatterKeyType: DefaultFrontmatterKeyType;
  templateFile: string;
  localePreference: string;
  apiKey: string;
  openPageOnCompletion: boolean;
}

export const DEFAULT_SETTINGS: BookSearchPluginSettings = {
  folder: '',
  fileNameFormat: '',
  frontmatter: '',
  content: '',
  useDefaultFrontmatter: true,
  defaultFrontmatterKeyType: DefaultFrontmatterKeyType.camelCase,
  templateFile: '',
  localePreference: 'default',
  apiKey: '',
  openPageOnCompletion: true,
};

export class BookSearchSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: BookSearchPlugin,
  ) {
    super(app, plugin);
  }

  private createHeader(title: string, containerEl: HTMLElement) {
    const header = document.createDocumentFragment();
    header.createEl('h2', { text: title });
    return new Setting(containerEl).setHeading().setName(header);
  }

  private createGeneralSettings(containerEl: HTMLElement) {
    this.createHeader('General Settings', containerEl);
    this.createFileLocationSetting(containerEl);
    this.createFileNameFormatSetting(containerEl);
  }

  private createFileLocationSetting(containerEl: HTMLElement) {
    new Setting(containerEl)
      .setName('New file location')
      .setDesc('New book notes will be placed here.')
      .addSearch(cb => {
        try {
          new FolderSuggest(this.app, cb.inputEl);
        } catch (e) {
          console.error(e);
        }
        cb.setPlaceholder('Example: folder1/folder2')
          .setValue(this.plugin.settings.folder)
          .onChange(new_folder => {
            this.plugin.settings.folder = new_folder;
            this.plugin.saveSettings();
          });
      });
  }

  private createFileNameFormatSetting(containerEl: HTMLElement) {
    const newFileNameHint = document.createDocumentFragment().createEl('code', {
      text: replaceDateInString(this.plugin.settings.fileNameFormat) || '{{title}} - {{author}}',
    });
    new Setting(containerEl)
      .setClass('book-search-plugin__settings--new_file_name')
      .setName('New file name')
      .setDesc('Enter the file name format.')
      .addSearch(cb => {
        try {
          new FileNameFormatSuggest(this.app, cb.inputEl);
        } catch (e) {
          console.error(e);
        }
        cb.setPlaceholder('Example: {{title}} - {{author}}')
          .setValue(this.plugin.settings.fileNameFormat)
          .onChange(newValue => {
            this.plugin.settings.fileNameFormat = newValue?.trim();
            this.plugin.saveSettings();
            newFileNameHint.innerHTML = replaceDateInString(newValue) || '{{title}} - {{author}}';
          });
      });
    containerEl
      .createEl('div', {
        cls: ['setting-item-description', 'book-search-plugin__settings--new_file_name_hint'],
      })
      .append(newFileNameHint);
  }

  private createTemplateFileSetting(containerEl: HTMLElement) {
    const templateFileDesc = document.createDocumentFragment();
    templateFileDesc.createDiv({ text: 'Files will be available as templates.' });
    templateFileDesc.createEl('a', {
      text: 'Example Template',
      href: `${docUrl}#example-template`,
    });
    new Setting(containerEl)
      .setName('Template file')
      .setDesc(templateFileDesc)
      .addSearch(cb => {
        try {
          new FileSuggest(this.app, cb.inputEl);
        } catch {
          // eslint-disable
        }
        cb.setPlaceholder('Example: templates/template-file')
          .setValue(this.plugin.settings.templateFile)
          .onChange(newTemplateFile => {
            this.plugin.settings.templateFile = newTemplateFile;
            this.plugin.saveSettings();
          });
      });
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.classList.add('book-search-plugin__settings');

    // General Settings (folder, file name format)
    this.createGeneralSettings(containerEl);

    // Template file
    this.createTemplateFileSetting(containerEl);

    // Preferred locale (Google Books の検索 locale)
    const defaultLocale = window.moment.locale();
    new Setting(containerEl)
      .setName('Preferred locale')
      .setDesc('Sets the preferred locale to use when searching for books via Google Books.')
      .addDropdown(dropDown => {
        dropDown.addOption(defaultLocale, `${languages[defaultLocale] || defaultLocale} (Default Locale)`);
        window.moment.locales().forEach(locale => {
          const localeName = languages[locale];
          if (localeName && locale !== defaultLocale) dropDown.addOption(locale, localeName);
        });
        const localeValue = this.plugin.settings.localePreference;
        dropDown
          .setValue(localeValue === DEFAULT_SETTINGS.localePreference ? defaultLocale : localeValue)
          .onChange(async value => {
            this.plugin.settings.localePreference = value;
            await this.plugin.saveSettings();
          });
      });

    // Open New Book Note
    new Setting(containerEl)
      .setName('Open New Book Note')
      .setDesc('Enable or disable the automatic opening of the note on creation.')
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.openPageOnCompletion).onChange(async value => {
          this.plugin.settings.openPageOnCompletion = value;
          await this.plugin.saveSettings();
        }),
      );

    // Google API Settings
    this.createHeader('Google API Settings', containerEl);
    new Setting(containerEl)
      .setName('Description About Google API Settings')
      .setDesc(
        '**WARNING** please use this field after you must understand Google Cloud API, such as API key security.',
      );

    new Setting(containerEl)
      .setName('Status Check')
      .setDesc('check whether API key is saved. It does not guarantee that the API key is valid or invalid.')
      .addButton(button => {
        button.setButtonText('API Check').onClick(async () => {
          if (this.plugin.settings.apiKey.length) {
            new Notice('API key exist.');
          } else {
            new Notice('API key does not exist.');
          }
        });
      });

    const googleAPISetDesc = document.createDocumentFragment();
    googleAPISetDesc.createDiv({ text: 'Set your Books API key.' });
    googleAPISetDesc.createDiv({
      text: 'For security reason, saved API key is not shown in this textarea after saved.',
    });
    let tempKeyValue = '';
    new Setting(containerEl)
      .setName('Set API Key')
      .setDesc(googleAPISetDesc)
      .addText(text => {
        text.inputEl.type = 'password';
        text.setValue('').onChange(async value => {
          tempKeyValue = value;
        });
      })
      .addButton(button => {
        button.setButtonText('Save Key').onClick(async () => {
          this.plugin.settings.apiKey = tempKeyValue;
          await this.plugin.saveSettings();
          new Notice('API key Saved');
        });
      });
  }
}
