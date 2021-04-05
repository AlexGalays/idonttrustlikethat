"use strict";
exports.__esModule = true;
var extra_1 = require("../commonjs/extra");
var __1 = require("..");
var expect = require("expect");
var extra_2 = require("../src/extra");
var showErrorMessages = true;
describe('validation extras', function () {
    it('can validate an ISO date', function () {
        var okValidation = extra_1.isoDate.validate('2017-06-23T12:14:38.298Z');
        expect(okValidation.ok && okValidation.value.getFullYear() === 2017).toBe(true);
        var notOkValidation = extra_1.isoDate.validate('hello');
        expect(notOkValidation.ok).toBe(false);
    });
    it('can validate a recursive type', function () {
        var category = extra_1.recursion(function (self) {
            return __1.object({
                name: __1.string,
                categories: __1.array(self)
            });
        });
        var okValidation = category.validate({
            name: 'tools',
            categories: [{ name: 'piercing', categories: [] }]
        });
        expect(okValidation.ok).toBe(true);
        var notOkValidation = category.validate({
            name: 'tools',
            categories: [{ name2: 'piercing', categories: [] }]
        });
        expect(!notOkValidation.ok && notOkValidation.errors.length).toBe(1);
        printErrorMessage(notOkValidation);
    });
    it('can validate a boolean from a string', function () {
        var okValidation = extra_2.booleanFromString.validate('true');
        var okValidation2 = extra_2.booleanFromString.validate('false');
        var notOkValidation = extra_2.booleanFromString.validate('nope');
        var notOkValidation2 = extra_2.booleanFromString.validate(true);
        expect(okValidation.ok && okValidation.value).toBe(true);
        expect(okValidation2.ok && okValidation2.value).toBe(false);
        expect(notOkValidation.ok).toBe(false);
        expect(notOkValidation2.ok).toBe(false);
    });
    it('can validate a relative URL', function () {
        var okValidation = extra_2.relativeUrl.validate('path');
        var okValidation2 = extra_2.relativeUrl.validate('path/subpath');
        var notOkValidation = extra_2.booleanFromString.validate('//aa');
        var notOkValidation2 = extra_2.booleanFromString.validate(true);
        expect(okValidation.ok && okValidation.value).toBe('path');
        expect(okValidation2.ok && okValidation2.value).toBe('path/subpath');
        expect(notOkValidation.ok).toBe(false);
        expect(notOkValidation2.ok).toBe(false);
    });
});
function printErrorMessage(validation) {
    if (!showErrorMessages)
        return;
    if (!validation.ok)
        console.log(__1.errorDebugString(validation.errors));
}
