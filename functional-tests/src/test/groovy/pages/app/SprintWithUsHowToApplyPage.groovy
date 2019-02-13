package pages.app
import geb.Page


class SprintWithUsHowToApplyPage extends Page {
	static at = { title.startsWith("BCDevExchange - The BC Developer") }

	static url = "sprintwithus-howtoapply"
	static content = {
		SWUTerms{$("a",'href':"/terms/rfq1")}
        OpportunitiesNavBar { $('a[ui-sref ~= "opportunities.list"]', 0).click() }



	}
}
