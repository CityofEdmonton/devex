package modules

import geb.spock.GebReportingSpec
import geb.Module
import geb.Browser
import pages.app.HomePage

import spock.lang.Unroll

/**
 * Example of a Module in Groovy.
 */

class LoginModule extends Module {

    static content = {
      adminLogin(wait: true) { $("#authentication.signinadmin") }
      signIn { $("#authentication.signin") }
      adminLoginInput { $("#username") }
      passwordInput { $("#password") }
      commitButton { $("button", type:"submit") }

      signinButton { $("#authentication.gov") }
      loginInput { $("input", id:"login_field") }
      userDisplayPicture { $("img", class:"header-profile-image") }
      gitHubLink { $("a", "ng-click":"vm.callOauthProvider('/api/auth/github')")[0] }
    }
   
    //@todo deprecate
    Boolean "Login As An Administrator"(java.lang.String userName, java.lang.String passWord, java.lang.String fullUserName){
        // Since the targeted link is not yet visible, Chrome will fail, so we forcefully do stuff
        js.exec('window.scrollTo(0, document.body.scrollHeight);')
        js.exec('window.scrollTo(document.body.scrollHeight, 0);')
        js.exec('document.getElementById("authentication.signinadmin").scrollIntoView(true);')
        js.exec('document.getElementById("authentication.signinadmin").click();') //adminLogin.click()

        waitFor { adminLoginInput }
        adminLoginInput.value( userName ) //admin
        passwordInput.value( passWord ) //adminadmin
        js.exec('window.scrollTo(0, document.body.scrollHeight);')
        commitButton.click()

        //I do not worry if the picture is present or not
     /*   waitFor { userDisplayPicture.displayed }
        if ( userDisplayPicture.displayed ) //"ADMIN LOCAL"
            return true
        else
            return false
     */       
    }

    Boolean "Login"(String username, String password, String fullName) {
       LoginAsAnAdministrator(username, password, fullName) 
    }

    Boolean adminLogout(){
        $('li.dropdown.open > ul.dropdown-menu > li:nth-of-type(4) > a').click()
        return true
    }
}
