class Target {
    constructor({target, otherTargets, command, comment, type} = {}) {
       this.target = target || '';
       this.otherTargets = otherTargets || '';
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

const LOCAL_STORAGE_KEY = 'savedMakefileTemplates';

new Vue({
    el: '#makefile-generator-app',
    data: {
        config: {
            targetSeparator: ':',
            variableSeparator: '=',
            commentSeparator: '##'
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
        targets: [
            new Target()
        ]
    },
    created() {
        this.loadSavedMakefiles();
    },
    async mounted() {
        this.$el.classList.remove('d-none');
    },
    computed: {
        makefileDownloadUrl() {
            return "data:application/octet-stream," + encodeURIComponent(this.makefileContents);
        },
        makefileContents() {
            let contents = '';
            const filteredTargets = this.targets.filter(target => target.target !== '');
            const variableTargets = filteredTargets.filter(target => target.type === 'variable');

            for (const target of variableTargets) {
                contents += `${target.target}${this.config.variableSeparator}${target.otherTargets}`;
                contents += "\n";
            }

            if (variableTargets.length > 0) {
                contents += "\n";
            }

            const targets = filteredTargets.filter(target => target.type === 'target');
            for (const target of targets) {
                let otherTargetsPrefix = ' ';

                contents += `${target.target}${this.config.targetSeparator}`;

                if (target.otherTargets !== '') {
                    contents += `${otherTargetsPrefix}${target.otherTargets}`;
                }

                if (target.comment !== '') {
                    contents += ` ${this.config.commentSeparator} ${target.comment}`;
                }

                if (target.command !== '') {
                    target.command
                        .split("\n")
                        .filter(content => content !== '')
                        .forEach(command => {
                            contents += `\n\t${command}`;
                        });
                }

                contents += `\n`;
                contents += `\n`;
            }

            return contents.trim();
        }
    },
    methods: {
        loadSavedMakefiles() {
            this.savedMakefiles = [];
            this._getSavedMakefiles().forEach(savedMakefile => {
                this.savedMakefiles.push({ name: savedMakefile.name, targets: savedMakefile.targets });
            });
        },
        addMakeTarget({target = '', otherTargets = '', command = '', comment = '', type = ''} = {}) {
            this.targets.push(new Target({ target, otherTargets, command, comment, type }));
        },
        addMakeTargetFromTemplate(templateName) {
            const target = templateName;
            const { otherTargets, command, comment, type } = this.targetTemplates[target];
            this.targets.push(new Target({ target, otherTargets, command, comment, type }));
        },
        addHelpMakeTarget() {
            const target = 'help';
            const [
                { target: defaultTarget, otherTargets: defaultOtherTargets },
                { command, comment }
            ] = this.targetTemplates[target];

            this.targets.unshift(
                new Target({ target: defaultTarget, otherTargets: defaultOtherTargets }),
                new Target({ target, command, comment })
            );
        },
        moveUp(target) {
            const index = this.targets.indexOf(target);

            this._arrayMove(this.targets, index, index-1);
        },
        moveDown(target) {
            const index = this.targets.indexOf(target);

            this._arrayMove(this.targets, index, index+1);
        },
        remove(target) {
            const index = this.targets.indexOf(target);

            this.targets.splice(index, 1);
        },
        saveMakefile() {
            const savedMakefile = this.savedMakefiles.find(savedMakefile => savedMakefile.name === this.savedMakefileName);
            if (!savedMakefile) {
                this.savedMakefiles.push({ name: this.savedMakefileName, targets: this.targets });
            } else {
                savedMakefile.targets = this.targets;
            }

            this._saveMakefiles(this.savedMakefiles);
        },
        loadMakefile() {
            this.savedMakefileName = this.loadedMakefile.name;
            this.targets = this.loadedMakefile.targets;
        },
		exportSavedMakefiles() {
			const exportData = JSON.stringify(this._getSavedMakefiles(), null, 2);
			const blob = new Blob([exportData]);
			const url = URL.createObjectURL(blob);
			const currentDate = new Date()
                .toLocaleDateString("hu", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit"
                })
                .replace(/. /g, '')
                .replace(/:/g, '');
			const fileName = `export-makefiles-${currentDate}.json`;

			const link = document.createElement('a');

			link.setAttribute('href', url);
			link.setAttribute('download', fileName);
			link.click();
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
            if(!confirm(`Are you sure you want to delete saved makefile: '${this.loadedMakefile.name}'?`)) {
                return;
            }

            const index = this.savedMakefiles.indexOf(this.loadedMakefile);
            this.savedMakefiles.splice(index, 1);

            this._saveMakefiles(this.savedMakefiles);
        },
        loadMakefileFromFile(event) {
            const file = event.target.files[0];
            const reader = new FileReader();

            reader.onload = e => this.targets = this._parseMakefile(e.target.result);
            reader.readAsText(file);
        },
        copyToClipboard(element) {
            element.select();
            document.execCommand('copy');
        },
        onParse(event) {
            if (!event.target.value) {
                return;
            }
            this.targets = this._parseMakefile(event.target.value);
            event.target.value = '';
        },

        _parseMakefile(contents) {
            const targets = [];
            contents.split("\n").filter(line => line !== '').forEach(line => {
                if (line[0] === "\t") {
                    targets[targets.length-1].appendCommand(line.trim(), "\n");
                } else {
                    const [ left, comment ] = this._splitToTwoParts(line, this.config.commentSeparator);
                    const isVariable = left.match(new RegExp(this.config.variableSeparator));
                    const [ target, otherTargets ] = this._splitToTwoParts(
                        left,
                        isVariable ? this.config.variableSeparator : this.config.targetSeparator
                    );
                    let type = isVariable ? 'variable' : 'target';

                    targets.push(
                        new Target({
                            target: target,
                            command: '',
                            comment: comment.trim(),
                            otherTargets: otherTargets.trim(),
                            type
                        })
                    );
                }
            });

            return targets;
        },
        _splitToTwoParts(text, delimiter) {
            const parts = text.split(delimiter);

            return [parts.shift(), parts.join(delimiter)];
        },
        _getSavedMakefiles() {
            const savedMakefileTemplatesJson = localStorage.getItem(LOCAL_STORAGE_KEY) || '[]';

            return JSON.parse(savedMakefileTemplatesJson);
        },
        _saveMakefiles(makefiles) {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(makefiles))
        },
        _arrayMove(arr, fromIndex, toIndex) {
            const element = arr[fromIndex];
            arr.splice(fromIndex, 1);
            arr.splice(toIndex, 0, element);
        }
    }
});
