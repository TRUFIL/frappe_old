QUnit.module('views');

QUnit.test("Verification of navbar menu links", function(assert) {
	assert.expect(14);
	let done = assert.async();
	let navbar_user_items = ['Set Desktop Icons', 'My Settings', 'Reload', 'View Website', 'Background Jobs', 'Logout'];
	let modal_and_heading = ['Documentation', 'About'];
	
	frappe.run_serially([
		// Goto Desk using button click to check if its working
		() => frappe.tests.click_navbar_item('Home'),
		() => assert.deepEqual([""], frappe.get_route()),

		// Click username on the navbar (Adminisrator) and verify visibility of all elements 
		() => frappe.tests.click_navbar_item('navbar_user'),
		() => navbar_user_items.forEach(function(navbar_user_item) {
			assert.ok(frappe.tests.is_visible(navbar_user_item));
		}),

		// Click Help and verify visibility of all elements 
		() => frappe.tests.click_navbar_item('Help'),
		() => modal_and_heading.forEach(function(modal) {
			assert.ok(frappe.tests.is_visible(modal));
		}),

		// Goto Desk
		() => frappe.tests.click_navbar_item('Home'),
		() => frappe.timeout(0.3),

		// Click navbar-username and verify links of all menu items
		// Check if clicking on 'Set Desktop Icons' redirects you to the correct page 
		() => frappe.tests.click_navbar_item('navbar_user'),
		() => frappe.tests.click_dropdown_item('Set Desktop Icons'),
		() => assert.deepEqual(["modules_setup"], frappe.get_route()),
		() => frappe.tests.click_navbar_item('Home'),
			
		// Check if clicking on 'My Settings' redirects you to the correct page 
		() => frappe.tests.click_navbar_item('navbar_user'),
		() => frappe.tests.click_dropdown_item('My Settings'),
		() => assert.deepEqual(["Form", "User", "Administrator"], frappe.get_route()),
		() => frappe.tests.click_navbar_item('Home'),
			
		// Check if clicking on 'Background Jobs' redirects you to the correct page 
		() => frappe.tests.click_navbar_item('navbar_user'),
		() => frappe.tests.click_dropdown_item('Background Jobs'),
		() => assert.deepEqual(["background_jobs"], frappe.get_route()),
		() => frappe.tests.click_navbar_item('Home'),

		// Click Help and check both modals
		// Check if clicking 'Documentation' opens the right modal
		() => frappe.tests.click_navbar_item('Help'),
		() => frappe.tests.click_dropdown_item('Documentation'),
		() => assert.ok(frappe.tests.is_visible('Documentation', 'span')),
		() => frappe.tests.click_generic_text('Close', 'button'),
			
		// Check if clicking 'About' opens the right modal
		() => frappe.tests.click_navbar_item('Help'),
		() => frappe.tests.click_dropdown_item('About'),
		() => assert.ok(frappe.tests.is_visible('Frappe Framework', 'div')),
		() => frappe.tests.click_generic_text('Close', 'button'),

		() => done()
	]);
});