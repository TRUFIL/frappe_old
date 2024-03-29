frappe.provide('frappe.views');

frappe.views.BaseList = class BaseList {
	constructor(opts) {
		Object.assign(this, opts);
		this.show();
	}

	show() {
		this.init().then(() => this.refresh());
	}

	init() {

		if (this.init_promise) return this.init_promise;

		let tasks = [
			this.setup_defaults,
			this.set_stats,
			this.setup_fields,
			// make view
			this.setup_page,
			this.setup_page_head,
			this.setup_side_bar,
			this.setup_list_wrapper,
			this.setup_filter_area,
			this.setup_sort_selector,
			this.setup_result_area,
			this.setup_no_result_area,
			this.setup_freeze_area,
			this.setup_paging_area,
			this.setup_footnote_area,
			this.setup_view,
		].map(fn => fn.bind(this));

		this.init_promise = frappe.run_serially(tasks);
		return this.init_promise;
	}

	setup_defaults() {
		this.page_name = frappe.get_route_str();
		this.page_title = this.page_title || __(this.doctype);
		this.meta = frappe.get_meta(this.doctype);
		this.settings = frappe.listview_settings[this.doctype] || {};
		this.user_settings = frappe.get_user_settings(this.doctype);

		this.start = 0;
		this.page_length = 20;
		this.data = [];
		this.method = 'frappe.desk.reportview.get';

		this.can_create = frappe.model.can_create(this.doctype);
		this.can_delete = frappe.model.can_delete(this.doctype);
		this.can_write = frappe.model.can_write(this.doctype);

		this.fields = [];
		this.filters = [];
		this.order_by = 'modified desc';

		// Setup buttons
		this.primary_action = null;
		this.secondary_action = {
			label: __('Refresh'),
			action: () => this.refresh()
		};

		this.menu_items = [{
			label: __('Refresh'),
			action: () => this.refresh(),
			class: 'visible-xs'
		}];
	}

	setup_fields() {
		this.set_fields();
		this.build_fields();
	}

	set_fields() {
		let fields = [].concat(
			frappe.model.std_fields_list,
			this.get_fields_in_list_view(),
			[this.meta.title_field, this.meta.image_field],
			(this.settings.add_fields || [])
		);
		fields.forEach(f => this._add_field(f));
	}

	get_fields_in_list_view() {
		return this.meta.fields.filter(df => {
			return frappe.model.is_value_type(df.fieldtype) && (
				df.in_list_view
				&& frappe.perm.has_perm(this.doctype, df.permlevel, 'read')
			) || (
				df.fieldtype === 'Currency'
				&& df.options
				&& !df.options.includes(':')
			) || (
				df.fieldname === 'status'
			);
		});
	}

	build_fields() {
		// fill in missing doctype
		this.fields = this.fields.map(f => {
			if (typeof f === 'string') {
				f = [f, this.doctype];
			}
			return f;
		});
		//de-dup
		this.fields = this.fields.uniqBy(f => f[0] + f[1]);
	}

	_add_field(fieldname) {
		if (!fieldname) return;
		let doctype = this.doctype;

		if (typeof fieldname === 'object') {
			// df is passed
			const df = fieldname;
			fieldname = df.fieldname;
			doctype = df.parent;
		}

		const is_valid_field = frappe.model.std_fields_list.includes(fieldname)
			|| frappe.meta.has_field(doctype, fieldname);

		if (!is_valid_field) {
			return;
		}

		this.fields.push([fieldname, doctype]);
	}

	set_stats() {
		this.stats = ['_user_tags'];
		// add workflow field (as priority)
		this.workflow_state_fieldname = frappe.workflow.get_state_fieldname(this.doctype);
		if (this.workflow_state_fieldname) {
			if (!frappe.workflow.workflows[this.doctype]['override_status']) {
				this._add_field(this.workflow_state_fieldname);
			}
			this.stats.push(this.workflow_state_fieldname);
		}
	}

	setup_page() {
		this.parent.list_view = this;
		this.page = this.parent.page;
		this.$page = $(this.parent);
		this.page.page_form.removeClass('row').addClass('flex');
	}

	setup_page_head() {
		this.page.set_title(this.page_title);
		this.set_menu_items();
		this.set_breadcrumbs();
	}

	set_menu_items() {
		const $secondary_action = this.page.set_secondary_action(
			this.secondary_action.label,
			this.secondary_action.action,
			this.secondary_action.icon
		);
		if (!this.secondary_action.icon) {
			$secondary_action.addClass('hidden-xs');
		} else {
			$secondary_action.addClass('visible-xs');
		}

		this.menu_items.map(item => {
			const $item = this.page.add_menu_item(item.label, item.action, item.standard);
			if (item.class) {
				$item.addClass(item.class);
			}
		});
	}

	set_breadcrumbs() {
		frappe.breadcrumbs.add(this.meta.module, this.doctype);
	}

	setup_side_bar() {
		this.list_sidebar = new frappe.views.ListSidebar({
			doctype: this.doctype,
			stats: this.stats,
			parent: this.$page.find('.layout-side-section'),
			// set_filter: this.set_filter.bind(this),
			page: this.page,
			list_view: this
		});
	}

	setup_main_section() {
		this.setup_list_wrapper();
		this.setup_filter_area();
		this.setup_sort_selector();
		this.setup_result_area();
		this.setup_no_result_area();
		this.setup_freeze_area();
		this.setup_paging_area();
		this.setup_footnote_area();
	}

	setup_list_wrapper() {
		this.$frappe_list = $('<div class="frappe-list">').appendTo(this.page.main);
	}

	setup_filter_area() {
		this.filter_area = new FilterArea(this);

		if (this.filters.length > 0) {
			return this.filter_area.set(this.filters);
		}
	}

	setup_sort_selector() {
		this.sort_selector = new frappe.ui.SortSelector({
			parent: this.filter_area.$filter_list_wrapper,
			doctype: this.doctype,
			args: this.order_by,
			onchange: () => this.refresh(true)
		});
	}

	setup_result_area() {
		this.$result = $(`<div class="result">`).hide();
		this.$frappe_list.append(this.$result);
	}

	setup_no_result_area() {
		this.$no_result = $(`
			<div class="no-result text-muted flex justify-center align-center">
				${this.get_no_result_message()}
			</div>
		`).hide();
		this.$frappe_list.append(this.$no_result);
	}

	setup_freeze_area() {
		this.$freeze = $('<div class="freeze"></div>').hide();
		this.$frappe_list.append(this.$freeze);
	}

	get_no_result_message() {
		return __('Nothing to show');
	}

	setup_paging_area() {
		const paging_values = [20, 100, 500];
		this.$paging_area = $(
			`<div class="list-paging-area level">
				<div class="level-left">
					<div class="btn-group">
						${paging_values.map(value => `
							<button type="button" class="btn btn-default btn-sm btn-paging"
								data-value="${value}">
								${value}
							</button>
						`).join('')}
					</div>
				</div>
				<div class="level-right">
					<button class="btn btn-default btn-more btn-sm">
						${__("More")}...
					</button>
				</div>
			</div>`
		).hide();
		this.$frappe_list.append(this.$paging_area);

		// set default paging btn active
		this.$paging_area
			.find(`.btn-paging[data-value="${this.page_length}"]`)
			.addClass('btn-info');

		this.$paging_area.on('click', '.btn-paging, .btn-more', e => {
			const $this = $(e.currentTarget);

			if ($this.is('.btn-paging')) {
				// set active button
				this.$paging_area.find('.btn-paging').removeClass('btn-info');
				$this.addClass('btn-info');

				this.start = 0;
				this.page_length = $this.data().value;
				this.refresh();
			} else if ($this.is('.btn-more')) {
				this.start = this.start + this.page_length;
				this.refresh();
			}
		});
	}

	setup_footnote_area() {
		this.$footnote_area = null;
	}

	get_fields() {
		// convert [fieldname, Doctype] => tabDoctype.fieldname
		return this.fields.map(f => frappe.model.get_full_column_name(f[0], f[1]));
	}

	setup_view() {
		// for child classes
	}

	get_filters_for_args() {
		// filters might have a fifth param called hidden,
		// we don't want to pass that server side
		return this.filter_area.get().map(filter => filter.slice(0, 4));
	}

	get_args() {
		return {
			doctype: this.doctype,
			fields: this.get_fields(),
			filters: this.get_filters_for_args(),
			order_by: this.sort_selector.get_sql_string(),
			start: this.start,
			page_length: this.page_length
		};
	}

	refresh() {
		this.freeze(true);
		// fetch data from server
		const args = this.get_args();
		return frappe.call({
			method: this.method,
			type: 'GET',
			args: args
		}).then(r => {
			// render
			this.freeze(false);
			this.prepare_data(r);
			this.toggle_result_area();
			this.before_render();
			this.render();
		});
	}

	prepare_data(r) {
		let data = r.message || {};
		data = frappe.utils.dict(data.keys, data.values);

		if (this.start === 0) {
			this.data = data;
		} else {
			this.data = this.data.concat(data);
		}

		this.data = this.data.uniqBy(d => d.name);
	}

	freeze() {
		// show a freeze message while data is loading
	}

	before_render() {

	}

	render() {
		// for child classes
	}

	toggle_result_area() {
		this.$result.toggle(this.data.length > 0);
		this.$paging_area.toggle(this.data.length > 0);
		this.$no_result.toggle(this.data.length == 0);

		const show_more = (this.start + this.page_length) <= this.data.length;
		this.$paging_area.find('.btn-more')
			.toggle(show_more);
	}

	call_for_selected_items(method, args = {}) {
		args.names = this.get_checked_items(true);

		frappe.call({
			method: method,
			args: args,
			freeze: true,
			callback: r => {
				if (!r.exc) {
					this.refresh();
				}
			}
		});
	}
};

class FilterArea {
	constructor(list_view) {
		this.list_view = list_view;
		this.standard_filters_wrapper = this.list_view.page.page_form;
		this.$filter_list_wrapper = $('<div class="filter-list">').appendTo(this.list_view.$frappe_list);
		this.trigger_refresh = true;
		this.setup();
	}

	setup() {
		this.make_standard_filters();
		this.make_filter_list();
	}

	get() {
		let filters = this.filter_list.get_filters();
		let standard_filters = this.get_standard_filters();

		return filters
			.concat(standard_filters)
			.uniqBy(JSON.stringify);
	}

	set(filters) {
		// use to method to set filters without triggering refresh
		this.trigger_refresh = false;
		return this.add(filters, false)
			.then(() => {
				this.trigger_refresh = true;
			});
	}

	add(filters, refresh = true) {
		if (!filters || Array.isArray(filters) && filters.length === 0)
			return Promise.resolve();

		if (typeof filters[0] === 'string') {
			// passed in the format of doctype, field, condition, value
			const filter = Array.from(arguments);
			filters = [filter];
		}

		filters = filters.filter(f => {
			return !this.exists(f);
		});

		const { non_standard_filters, promise } = this.set_standard_filter(filters);

		return promise
			.then(() => {
				return non_standard_filters.length > 0 &&
					this.filter_list.add_filters(non_standard_filters);
			})
			.then(() => {
				refresh && this.list_view.refresh();
			});
	}

	refresh_list_view() {
		if (this.trigger_refresh) {
			this.list_view.refresh();
		}
	}

	exists(f) {
		let exists = false;
		// check in standard filters
		const fields_dict = this.list_view.page.fields_dict;
		if (f[2] === '=' && f[1] in fields_dict) {
			const value = fields_dict[f[1]].get_value();
			if (value) {
				exists = true;
			}
		}

		// check in filter area
		if (!exists) {
			exists = this.filter_list.filter_exists(f);
		}

		return exists;
	}

	set_standard_filter(filters) {
		if (filters.length === 0) {
			return {
				non_standard_filters: [],
				promise: Promise.resolve()
			};
		}

		const fields_dict = this.list_view.page.fields_dict;

		let out = filters.reduce((out, filter) => {
			// eslint-disable-next-line
			const [dt, fieldname, condition, value] = filter;
			out.promise = out.promise || Promise.resolve();
			out.non_standard_filters = out.non_standard_filters || [];

			if (fields_dict[fieldname] && condition === '=') {
				// standard filter
				out.promise = out.promise.then(
					() => fields_dict[fieldname].set_value(value)
				);
			} else {
				// filter out non standard filters
				out.non_standard_filters.push(filter);
			}
			return out;
		}, {});

		return out;
	}

	remove(fieldname) {
		const fields_dict = this.list_view.page.fields_dict;

		if (fieldname in fields_dict) {
			fields_dict[fieldname].set_value('');
			return;
		}
		this.filter_list.get_filter(fieldname).remove();
	}

	clear() {
		this.filter_list.clear_filters();

		const fields_dict = this.list_view.page.fields_dict;
		for (let key in fields_dict) {
			const field = this.list_view.page.fields_dict[key];
			field.set_value('');
		}
	}

	make_standard_filters() {
		$(
			`<div class="flex justify-center align-center">
				<span class="octicon octicon-search text-muted small"></span>
			</div>`
		)
			.css({
				height: '30px',
				width: '20px',
				marginRight: '-2px',
				marginLeft: '10px'
			})
			.prependTo(this.standard_filters_wrapper);

		let fields = [
			{
				fieldtype: 'Data',
				label: 'ID',
				condition: 'like',
				fieldname: 'name',
				onchange: () => this.refresh_list_view()
			}
		];

		const doctype_fields = this.list_view.meta.fields;

		fields = fields.concat(doctype_fields.filter(
			df => df.in_standard_filter &&
				frappe.model.is_value_type(df.fieldtype)
		).map(df => {
			let options = df.options;
			let condition = '=';
			let fieldtype = df.fieldtype;
			if (['Text', 'Small Text', 'Text Editor', 'Data'].includes(fieldtype)) {
				fieldtype = 'Data';
				condition = 'like';
			}
			if (df.fieldtype == "Select" && df.options) {
				options = df.options.split("\n");
				if (options.length > 0 && options[0] != "") {
					options.unshift("");
					options = options.join("\n");
				}
			}
			return {
				fieldtype: fieldtype,
				label: __(df.label),
				options: options,
				fieldname: df.fieldname,
				condition: condition,
				onchange: () => this.refresh_list_view()
			};
		}));

		if (fields.length > 3) {
			fields = fields.map((df, i) => {
				if (i >= 3) {
					df.input_class = 'hidden-sm hidden-xs';
				}
				return df;
			});
		}

		fields.map(df => this.list_view.page.add_field(df));
	}

	get_standard_filters() {
		const filters = [];
		const fields_dict = this.list_view.page.fields_dict;
		for (let key in fields_dict) {
			let field = fields_dict[key];
			let value = field.get_value();
			if (value) {
				if (field.df.condition === 'like' && !value.includes('%')) {
					value = '%' + value + '%';
				}
				filters.push([
					this.list_view.doctype,
					field.df.fieldname,
					field.df.condition || '=',
					value
				]);
			}
		}

		return filters;
	}

	make_filter_list() {
		this.filter_list = new frappe.ui.FilterGroup({
			base_list: this.list_view,
			parent: this.$filter_list_wrapper,
			doctype: this.list_view.doctype,
			default_filters: [],
			on_change: () => this.refresh_list_view()
		});
	}
}

// utility function to validate view modes
frappe.views.view_modes = ['List', 'Gantt', 'Kanban', 'Calendar', 'Image', 'Inbox', 'Report'];
frappe.views.is_valid = view_mode => frappe.views.view_modes.includes(view_mode);
