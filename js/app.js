class Entry {
    constructor({ target, otherTargets, codeBlock, command, comment, type } = {}) {
        this.target = target || '';
        this.otherTargets = otherTargets || '';
        this.codeBlock = codeBlock || '';
        this.command = command || '';
        this.comment = comment || '';
        this.type = type || 'target';
    }

    appendCommand(command, separator) {
        if (this.command !== '') {
            this.command += `${separator}${command}`
        } else {
            this.command += `${command}`
        }
    }
}

class MakefileEntry {
    constructor(name, contents = '') {
        this.name = name;
        this.contents = contents;
    }
}

const SAVED_MAKE_FILE_TEMPLATES_KEY = 'savedMakefileTemplates';
const PERSISTENT_STORAGE_KEY = 'persistentStorageApiKey';
const NAMES_KEY = '__names';

const TYPE_TARGET = 'target';
const TYPE_VARIABLE = 'variable';
const TYPE_CODE_BLOCK = 'code_block';
const TYPE_COMMENT = 'comment';

new Vue({
    el: '#makefile-generator-app',
    data: {
        types: {
            TYPE_TARGET,
            TYPE_VARIABLE,
            TYPE_CODE_BLOCK,
            TYPE_COMMENT
        },
        config: {
            targetSeparator: ':',
            variableSeparator: '=',
            commentSeparator: '##',
        },
        targetTemplates: {
            help: [
                {
                    target: 'default',
                    otherTargets: 'help'
                },
                {
                    command: "@fgrep -h \"##\" $(MAKEFILE_LIST) | fgrep -v fgrep | sed -e 's/\\\\$$//' -e 's/:.*#/ #/'",
                    comment: 'Show this help'
                },
            ],
            env: [
                {
                    command: '',
                    comment: 'Creates .env file'
                }
            ]
        },
        savedMakefiles: [],
        loadedMakefile: null,
        savedMakefileName: '',
        entries: [
            new Entry()
        ],
        examples: [
            new MakefileEntry('examples')
        ],
        selectedExample: null
    },
    created() {
        this.loadSavedMakefiles();
    },
    async mounted() {
        this.$el.classList.remove('d-none');
        await this.loadExamples();
    },
    computed: {
        makefileDownloadUrl() {
            return "data:application/octet-stream," + encodeURIComponent(this.makefileContents);
        },
        makefileContents() {
            let contents = '';
            for (const entry of this.entries) {
                let otherTargetsPrefix = ' ';

                if (entry.type === TYPE_VARIABLE) {
                    if (entry.target !== '') {
                        contents += entry.target;
                        contents += this.config.variableSeparator;
                        contents += entry.otherTargets;
                    }
                } else if (entry.type === TYPE_CODE_BLOCK) {
                    contents += entry.codeBlock;
                } else if (entry.target !== '') {
                    contents += `${entry.target}${this.config.targetSeparator}`;

                    if (entry.otherTargets !== '') {
                        contents += `${otherTargetsPrefix}${entry.otherTargets}`;
                    }
                }

                if (entry.type === TYPE_COMMENT) {
                    contents += entry.comment;
                } else if (entry.comment !== '') {
                    contents += ` ${this.config.commentSeparator} ${entry.comment}`;
                }

                if (entry.command !== '') {
                    entry.command
                        .split("\n")
                        .filter(command => command !== '')
                        .forEach(command => {
                            contents += "\n";
                            if (!this._checkIsCommand(command)) {
                                contents += "\t";
                            }
                            contents += command;
                        });
                }

                contents += `\n`;
            }

            return contents.trim();
        }
    },
    methods: {
        loadSavedMakefiles() {
            this.savedMakefiles = [];
            this._getSavedMakefiles().forEach(savedMakefile => {
                this.savedMakefiles.push({
                    name: savedMakefile.name,
                    entries: savedMakefile.entries || savedMakefile.targets || []
                });
            });
        },
        addEntry({ target = '', otherTargets = '', command = '', comment = '', type = '' } = {}) {
            this.entries.push(new Entry({ target, otherTargets, command, comment, type }));
        },
        addMakeTargetFromTemplate(templateName) {
            const target = templateName;
            const { otherTargets, command, comment, type } = this.targetTemplates[target];
            this.entries.push(new Entry({ target, otherTargets, command, comment, type }));
        },
        addHelpTarget() {
            const target = 'help';
            const [
                { target: defaultTarget, otherTargets: defaultOtherTargets },
                { command, comment }
            ] = this.targetTemplates[target];

            this.entries.unshift(
                new Entry({ target: defaultTarget, otherTargets: defaultOtherTargets }),
                new Entry({ target, command, comment })
            );
        },
        moveUp(target) {
            const index = this.entries.indexOf(target);

            this._arrayMove(this.entries, index, index - 1);
        },
        moveDown(target) {
            const index = this.entries.indexOf(target);

            this._arrayMove(this.entries, index, index + 1);
        },
        remove(target) {
            const index = this.entries.indexOf(target);

            this.entries.splice(index, 1);
        },
        saveMakefile() {
            const savedMakefile = this.savedMakefiles.find(savedMakefile => savedMakefile.name === this.savedMakefileName);
            if (savedMakefile) {
                savedMakefile.entries = this.entries;
            } else {
                this.savedMakefiles.push({ name: this.savedMakefileName, entries: this.entries });
            }

            this._saveMakefiles(this.savedMakefiles);
        },
        loadMakefile() {
            this.savedMakefileName = this.loadedMakefile.name;
            this.entries = this.loadedMakefile.entries;
        },
        exportSavedMakefiles() {
            const exportData = JSON.stringify(this._getSavedMakefiles(), null, 2);
            const blob = new Blob([exportData]);
            const url = URL.createObjectURL(blob);
            const currentDate = new Date()
                .toLocaleDateString('hu', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                })
                .replace(/. /g, '')
                .replace(/:/g, '');
            const fileName = `export-makefiles-${currentDate}.json`;

            const link = document.createElement('a');
            link.setAttribute('href', url);
            link.setAttribute('download', fileName);
            link.click();
        },
        async backupSavedMakeFiles() {
            const apiKey = this._getPersistentStorageApiKey();
            const savedMakefiles = this._getSavedMakefiles();

            const names = await this._fetchFromPersistentStorage(apiKey, NAMES_KEY, '[]');
            for (const savedMakefile of savedMakefiles) {
                names.push(savedMakefile.name);
                await this._saveToPersistentStorage(apiKey, savedMakefile.name, savedMakefiles);
            }
            await this._saveToPersistentStorage(apiKey, NAMES_KEY, names);
        },
        async restoreSavedMakeFiles() {
            if (!confirm('Are you sure?')) {
                return;
            }

            const apiKey = this._getPersistentStorageApiKey();
            const names = await this._fetchFromPersistentStorage(apiKey, NAMES_KEY);
            const makefiles = [];
            for (const name in names) {
                makefiles.push(await this._fetchFromPersistentStorage(apiKey, name));
            }

            this._saveMakefiles(makefiles);
        },
        handleSelectImportSavedMakefiles(event) {
            const file = event.target.files[0];
            const reader = new FileReader();

            reader.onload = e => {
                const savedMakefilesJson = e.target.result.toString();

                this._saveMakefiles(JSON.parse(savedMakefilesJson));

                this.loadSavedMakefiles();
            };
            reader.readAsText(file);
        },
        deleteLoadedMakefile() {
            if (!confirm(`Are you sure you want to delete saved makefile: '${this.loadedMakefile.name}'?`)) {
                return;
            }

            const index = this.savedMakefiles.indexOf(this.loadedMakefile);
            this.savedMakefiles.splice(index, 1);

            this._saveMakefiles(this.savedMakefiles);
        },
        loadMakefileFromFile(event) {
            const file = event.target.files[0];
            const reader = new FileReader();

            reader.onload = e => this.entries = this._parseMakefile(e.target.result);
            reader.readAsText(file);
        },
        copyToClipboard(element) {
            element.select();
            document.execCommand('copy');
        },
        async loadExamples() {
            let i = 1;
            while (true) {
                const response = await fetch(`examples/${i}.txt`);
                if (!response.ok) {
                    break;
                }

                let contents = await response.text();
                const lines = contents.split("\n");
                const title = lines[0];

                let name = String(i);
                if (title.startsWith('###')) {
                    name += ` - ${title.substring(3).trim()}`;
                    contents = lines.splice(1).join("\n");
                }

                this.examples.push({name, contents});
                i++;
            }
        },
        selectExample(e) {
            this.entries = this._parseMakefile(e.target.value);
        },
        resizeElement(el, px) {
            el.style.height = `${px}px`;
        },
        handleTabKey(e) {
            if (e.key !== 'Tab') {
                return;
            }

            e.preventDefault();

            const start = e.target.selectionStart;
            const end = e.target.selectionEnd;

            e.target.value = e.target.value.substring(0, start) + "\t" + e.target.value.substring(end);
            e.target.selectionStart = e.target.selectionEnd = start + 1;
        },
        onParse(event) {
            if (!event.target.value) {
                return;
            }

            this.entries = this._parseMakefile(event.target.value);
            event.target.value = '';
        },
        _parseMakefile(contents) {
            const entries = [];
            let codeBlock = '';

            for (const line of contents.split("\n")) {
                if (this._checkIsStartCodeBlock(line)) {
                    codeBlock += `${line}\n`;

                } else if (this._checkIsEndCodeBlock(line)) {
                    codeBlock += `${line}`;
                    entries.push(new Entry({
                        type: TYPE_CODE_BLOCK,
                        codeBlock
                    }));
                    codeBlock = '';
                } else if (this._checkIsCodeBlock(codeBlock)) {
                    codeBlock += `${line}\n`;
                } else if (this._checkIsCommand(line)) {
                    entries[entries.length - 1].appendCommand(line, "\n");
                } else if (line[0] === '#') {
                    entries.push(
                        new Entry({
                            type: TYPE_COMMENT,
                            comment: line
                        })
                    );
                } else {
                    const [left, comment] = this._splitToTwoParts(line, this.config.commentSeparator);
                    const isVariable = left.match(new RegExp(this.config.variableSeparator));
                    const [target, otherTargets] = this._splitToTwoParts(
                        left,
                        isVariable ? this.config.variableSeparator : this.config.targetSeparator
                    );
                    const type = isVariable ? TYPE_VARIABLE : TYPE_TARGET;

                    entries.push(
                        new Entry({
                            type,
                            target,
                            comment: comment.trim(),
                            otherTargets: otherTargets.trim()
                        })
                    );
                }
            }

            return entries;
        },
        _checkIsStartCodeBlock(line) {
            return new RegExp('^(if|define)').test(line) && !this._checkIsTargetOrVariable(line);
        },
        _checkIsEndCodeBlock(line) {
            return new RegExp('^(endif|endef)').test(line) && !this._checkIsTargetOrVariable(line);
        },
        _checkIsCodeBlock(codeBlock) {
            return codeBlock !== '';
        },
        _checkIsCommand(command) {
            return command[0] === "\t";
        },
        _checkIsTargetOrVariable(text) {
            return new RegExp(`${this.config.targetSeparator}|${this.config.variableSeparator}`).test(text);
        },
        _splitToTwoParts(text, delimiter) {
            const parts = text.split(delimiter);

            return [parts.shift(), parts.join(delimiter)];
        },
        _getSavedMakefiles() {
            const savedMakefileTemplatesJson = localStorage.getItem(SAVED_MAKE_FILE_TEMPLATES_KEY) || '[]';

            return JSON.parse(savedMakefileTemplatesJson);
        },
        _saveMakefiles(makefiles) {
            localStorage.setItem(SAVED_MAKE_FILE_TEMPLATES_KEY, JSON.stringify(makefiles))
        },
        _getPersistentStorageApiKey() {
            let apiKey = localStorage.getItem(PERSISTENT_STORAGE_KEY);

            if (apiKey) {
                return apiKey;
            }

            apiKey = prompt('Please provide the Api Key');
            localStorage.setItem(PERSISTENT_STORAGE_KEY, apiKey);

            return apiKey;
        },
        async _saveToPersistentStorage(apiKey, key, value) {
            const valueInBase64 = btoa(JSON.stringify(value));
            const response = await fetch(`https://keyvalue.immanuel.co/api/KeyVal/UpdateValue/${apiKey}/${key}/${valueInBase64}`, {
                method: 'POST'
            });

            return Boolean(response.json());
        },
        async _fetchFromPersistentStorage(apiKey, key, defaultValue = '{}') {
            const response = await fetch(`https://keyvalue.immanuel.co/api/KeyVal/GetValue/${apiKey}/${key}`);
            const base64 = await response.json();
            const json = base64 ? atob(base64) : defaultValue;

            return JSON.parse(json);
        },
        _arrayMove(arr, fromIndex, toIndex) {
            const element = arr[fromIndex];
            arr.splice(fromIndex, 1);
            arr.splice(toIndex, 0, element);
        }
    }
});
