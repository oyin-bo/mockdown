# Parser Layer

The scanner work being well on the way, we need to start working on the parser layer sitting above the scanner.

The planning stage should put forward a proposal for the following:

* High-level API for the parser from the consumer side
* Rough shape of AST node base (common shape) and the ways it can extend for specific nodes
* List of nodes, with main data carried by them
* Facilities to walk AST tree
* Facilities to apply textual diff to an underlying Markdown document and receive a reparsed AST tree
* Other features that can be used for editors and other relevant apps
* Specific integrations with ProseMirror -- one of the flagship use cases
* Ability to generate HTML
* A testing harness similar to verifyTokens implemented for the scanner, ideally similar
* Extending the benchmark harness to cover the parser layer

These requirements are the most important plan to work out, and put more flesh to the skeleton.

---

The next step in the planning will involve a breakdown of the work into tasks.

Ideally the bulk of the work can be done in parallel with the completion of the scanner. As much as possible it's best to have parser work also proceeding concurrently within the parser layer too.

## Feature Set

...to be defined from the above list...